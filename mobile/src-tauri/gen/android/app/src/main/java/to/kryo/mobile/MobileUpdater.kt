package to.kryo.mobile

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.security.MessageDigest

/** APK updates always come from our public release, and must carry the same
 * Android signing certificate as the installed app. Android confirms install. */
object MobileUpdater {
    private const val RELEASE = "https://api.github.com/repos/Kryoto-Dev/kryoto-mobile/releases/latest"

    private fun open(url: String, depth: Int = 0): HttpURLConnection {
        val uri = URI(url)
        require(depth <= 5 && uri.scheme == "https" && uri.userInfo == null && uri.port in listOf(-1, 443) &&
            uri.host in setOf("api.github.com", "github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com")) { "Untrusted update address." }
        if (uri.host == "github.com") require(uri.path.startsWith("/Kryoto-Dev/kryoto-mobile/releases/download/"))
        val conn = uri.toURL().openConnection() as HttpURLConnection
        conn.connectTimeout = 10_000
        conn.readTimeout = 30_000
        conn.instanceFollowRedirects = false
        conn.setRequestProperty("User-Agent", "Kryoto-Mobile")
        if (conn.responseCode in listOf(301, 302, 303, 307, 308)) {
            val next = uri.resolve(conn.getHeaderField("Location")).toString()
            conn.disconnect()
            return open(next, depth + 1)
        }
        if (conn.responseCode !in 200..299) { conn.disconnect(); error("The update server did not answer. Try again later.") }
        return conn
    }

    fun newer(candidate: String, installed: String): Boolean {
        fun parts(v: String): List<Int>? = v.removePrefix("v").split('.').takeIf { it.size == 3 }?.map { it.toIntOrNull() ?: return null }
        val a = parts(candidate) ?: return false
        val b = parts(installed) ?: return false
        for (i in 0..2) if (a[i] != b[i]) return a[i] > b[i]
        return false
    }

    fun check(c: Context): JSONObject {
        val conn = open(RELEASE)
        val release = try { conn.inputStream.bufferedReader().use { JSONObject(it.readText()) } } finally { conn.disconnect() }
        val version = release.optString("tag_name").removePrefix("v")
        @Suppress("DEPRECATION")
        val installed = c.packageManager.getPackageInfo(c.packageName, 0).versionName ?: "0.0.0"
        val out = JSONObject().put("version", version).put("available", false)
        if (release.optBoolean("prerelease") || release.optBoolean("draft") || !newer(version, installed)) return out
        val assets = release.optJSONArray("assets") ?: return out
        for (abi in Build.SUPPORTED_ABIS) {
            for (i in 0 until assets.length()) {
                val asset = assets.getJSONObject(i)
                if (asset.optString("name") == "Kryoto-Mobile_${version}_${abi}.apk") {
                    return out.put("available", true).put("url", asset.getString("browser_download_url"))
                        .put("digest", asset.optString("digest")).put("size", asset.optLong("size"))
                }
            }
        }
        return out
    }

    fun prepareInstall(c: Context): Intent {
        val update = check(c)
        require(update.optBoolean("available")) { "You already have the newest compatible version." }
        val apk = File(c.cacheDir, "kryoto-update.apk")
        val partial = File(c.cacheDir, "kryoto-update.part")
        try {
            val conn = open(update.getString("url"))
            val digest = MessageDigest.getInstance("SHA-256")
            var size = 0L
            try {
                conn.inputStream.use { input -> partial.outputStream().use { output ->
                    val buffer = ByteArray(65536)
                    while (true) {
                        val n = input.read(buffer)
                        if (n < 0) break
                        size += n
                        require(size <= 256L * 1024 * 1024) { "Update file is too large." }
                        digest.update(buffer, 0, n)
                        output.write(buffer, 0, n)
                    }
                } }
            } finally { conn.disconnect() }
            require(size == update.getLong("size")) { "Update download was incomplete. Try again." }
            val expected = update.optString("digest")
            if (expected.startsWith("sha256:")) require(digest.digest().joinToString("") { "%02x".format(it) } == expected.removePrefix("sha256:")) { "Update verification failed." }
            @Suppress("DEPRECATION")
            val flags = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
            @Suppress("DEPRECATION")
            val candidate = c.packageManager.getPackageArchiveInfo(partial.absolutePath, flags) ?: error("Invalid update file.")
            @Suppress("DEPRECATION")
            val current = c.packageManager.getPackageInfo(c.packageName, flags)
            require(candidate.packageName == c.packageName && newer(candidate.versionName ?: "", current.versionName ?: "")) { "This is not a newer Kryoto Mobile update." }
            @Suppress("DEPRECATION")
            fun signatures(info: android.content.pm.PackageInfo): Set<String> {
                val certs = if (Build.VERSION.SDK_INT >= 28) info.signingInfo?.apkContentsSigners else info.signatures
                return certs?.map { it.toCharsString() }?.toSet() ?: emptySet()
            }
            val signers = signatures(current)
            require(signers.isNotEmpty() && signatures(candidate) == signers) { "This app uses a different signing key. Install the stable release from kryo.to/mobile first; future updates will install here." }
            if (apk.exists()) require(apk.delete())
            require(partial.renameTo(apk))
            val uri = FileProvider.getUriForFile(c, "${c.packageName}.fileprovider", apk)
            return Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        } finally { partial.delete() }
    }
}
