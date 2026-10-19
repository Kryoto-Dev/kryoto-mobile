package to.kryo.mobile

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.*
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.util.concurrent.TimeUnit

/** Native delivery survives a suspended WebView and an ordinary app close. */
object MobileNotifications {
    private fun site(cfg: JSONObject): String = if (BuildConfig.DEBUG && cfg.optString("api") == "http://10.0.2.2:3100") "http://10.0.2.2:3100" else "https://kryo.to"
    private fun prefs(c: Context) = c.getSharedPreferences("mobile-notifications", Context.MODE_PRIVATE)
    fun config(c: Context) = JSONObject(prefs(c).getString("config", "{}")!!)
    fun enabled(c: Context, key: String) = config(c).optJSONObject("prefs")?.optBoolean(key) == true

    @Synchronized
    fun configure(c: Context, next: JSONObject) {
        val old = config(c)
        val edit = prefs(c).edit().putString("config", next.toString())
        if (old.optString("token") != next.optString("token")) {
            edit.remove("accountSeen").putLong("accountSince", System.currentTimeMillis())
            NotificationManagerCompat.from(c).cancelAll()
        }
        val nextPrefs = next.optJSONObject("prefs") ?: JSONObject()
        val oldPrefs = old.optJSONObject("prefs") ?: JSONObject()
        for (group in listOf("requests", "community", "news", "account")) {
            if (nextPrefs.optBoolean(group) && !oldPrefs.optBoolean(group)) edit.putLong("since_$group", System.currentTimeMillis())
        }
        if (installId(old) != installId(next)) edit.remove("downloads").putLong("desktopSince", System.currentTimeMillis())
        if (listOf("complete", "failed").any { nextPrefs.optBoolean(it) && !oldPrefs.optBoolean(it) }) edit.putLong("desktopSince", System.currentTimeMillis())
        edit.apply()
        channels(c)
        val manager = WorkManager.getInstance(c)
        val settings = next.optJSONObject("prefs") ?: JSONObject()
        if (listOf("complete", "failed", "requests", "community", "news", "account").any { settings.optBoolean(it) }) {
            val work = PeriodicWorkRequestBuilder<MobileNotificationWorker>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
            manager.enqueueUniquePeriodicWork("mobile-notifications", ExistingPeriodicWorkPolicy.KEEP, work)
        } else manager.cancelUniqueWork("mobile-notifications")
        if (!settings.optBoolean("live")) c.stopService(Intent(c, DownloadWatchService::class.java))
    }

    private fun installId(cfg: JSONObject): String = cfg.optJSONObject("lan")?.optString("installId")
        ?: cfg.optJSONObject("relay")?.optString("installId") ?: ""

    fun channels(c: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val manager = c.getSystemService(NotificationManager::class.java)
        for ((id, title) in listOf("desktop" to "Desktop downloads", "requests" to "Your requests", "community" to "Community", "news" to "Kryoto news", "account" to "Your account")) {
            manager.createNotificationChannel(NotificationChannel(id, title, NotificationManager.IMPORTANCE_DEFAULT))
        }
        manager.createNotificationChannel(NotificationChannel("watch", "Following desktop downloads", NotificationManager.IMPORTANCE_LOW))
    }

    fun contentIntent(c: Context, target: String, id: String): PendingIntent {
        val intent = Intent(c, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra("notificationTarget", target)
        return PendingIntent.getActivity(c, id.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun show(c: Context, channel: String, id: String, title: String, body: String, target: String) {
        if (!NotificationManagerCompat.from(c).areNotificationsEnabled()) return
        val n = NotificationCompat.Builder(c, channel).setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title).setContentText(body).setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(contentIntent(c, target, id)).setAutoCancel(true).build()
        try { NotificationManagerCompat.from(c).notify(id.hashCode(), n) } catch (_: SecurityException) { }
    }

    fun hasActiveDownloads(snapshot: JSONObject): Boolean {
        val list = snapshot.optJSONArray("downloads") ?: return false
        return (0 until list.length()).any { list.optJSONObject(it)?.optString("status") in setOf("queued", "downloading", "extracting", "verifying", "installing") }
    }

    @Synchronized
    fun observe(c: Context, snapshot: JSONObject) {
        val cfg = config(c)
        if (snapshot.optString("installId") != installId(cfg)) return
        val list = snapshot.optJSONArray("downloads") ?: return
        val previous = JSONObject(prefs(c).getString("downloads", "{}")!!)
        val next = JSONObject()
        for (i in 0 until list.length()) {
            val d = list.optJSONObject(i) ?: continue
            val id = d.optString("id")
            val status = d.optString("status")
            next.put(id, status)
            val old = previous.optString(id)
            // Baseline completed history quietly. A new failure is actionable;
            // a completion is delivered only after observing its active state.
            if (old == status) continue
            val recent = d.optLong("addedAt") * 1000 >= prefs(c).getLong("desktopSince", Long.MAX_VALUE)
            if (status == "installed" && (old.isNotEmpty() || recent) && enabled(c, "complete")) {
                show(c, "desktop", "${installId(cfg)}:$id:installed", "${d.optString("title")} is ready", "Finished installing on ${snapshot.optString("name", "your PC")}.", "downloads")
            }
            if (status == "failed" && (old.isNotEmpty() || recent) && enabled(c, "failed")) {
                show(c, "desktop", "${installId(cfg)}:$id:failed", "${d.optString("title")} needs attention", d.optString("error", "Open Downloads to retry on your PC."), "downloads")
            }
        }
        prefs(c).edit().putString("downloads", next.toString()).apply()
    }

    /** Only the official site and validated private IPv4 companion routes. */
    fun get(url: String, token: String): JSONObject {
        val uri = URI(url)
        val host = uri.host ?: error("Missing host")
        val octets = host.split('.').mapNotNull { it.toIntOrNull() }
        val privateIp = octets.size == 4 && octets.joinToString(".") == host && octets.all { it in 0..255 } &&
            (octets[0] == 10 || (octets[0] == 172 && octets[1] in 16..31) || (octets[0] == 192 && octets[1] == 168))
        val localTest = BuildConfig.DEBUG && uri.scheme == "http" && host == "10.0.2.2" && uri.port == 3100 && uri.path.startsWith("/api/")
        require(uri.userInfo == null && (localTest || (uri.scheme == "https" && host == "kryo.to" && uri.port in listOf(-1, 443)) ||
            (uri.scheme == "http" && privateIp && uri.normalize().path.startsWith("/v1/"))))
        val conn = uri.toURL().openConnection() as HttpURLConnection
        try {
            conn.instanceFollowRedirects = false
            conn.connectTimeout = 3_000
            conn.readTimeout = 8_000
            conn.setRequestProperty("Authorization", "Bearer $token")
            require(conn.responseCode in 200..299)
            return conn.inputStream.bufferedReader().use { JSONObject(it.readText()) }
        } finally { conn.disconnect() }
    }

    fun snapshot(c: Context, cfg: JSONObject = config(c)): JSONObject? {
        val lan = cfg.optJSONObject("lan")
        if (lan != null) {
            try {
                val s = get("http://${lan.getString("host")}/v1/snapshot", lan.getString("token"))
                if (s.optString("installId") == installId(cfg)) return s
            } catch (_: Exception) { }
        }
        val relay = cfg.optJSONObject("relay") ?: return null
        val token = cfg.optString("token")
        if (cfg.isNull("token") || token.isEmpty()) return null
        val devices = get("${site(cfg)}/api/desktop/remote?full=${relay.getString("installId")}", token).optJSONArray("devices") ?: return null
        for (i in 0 until devices.length()) {
            val d = devices.optJSONObject(i) ?: continue
            if (d.optString("installId") == relay.optString("installId")) return d
        }
        return null
    }

    fun account(c: Context, cfg: JSONObject) {
        val token = cfg.optString("token")
        if (cfg.isNull("token") || token.isEmpty() || listOf("requests", "community", "news", "account").none { enabled(c, it) }) return
        val list = get("${site(cfg)}/api/notifications?limit=100", token).optJSONArray("notifications") ?: return
        synchronized(this) {
        // A sign-out/PC change can happen during a request; discard its result.
        if (config(c).optString("token") != token) return
        val saved = prefs(c).getStringSet("accountSeen", null)
        val seen = saved?.toMutableSet() ?: mutableSetOf()
        for (i in list.length() - 1 downTo 0) {
            val n = list.optJSONObject(i) ?: continue
            val id = n.optString("id")
            val type = n.optString("type")
            val group = when {
                type.startsWith("request.") || type == "signal.refilled" -> "requests"
                type.startsWith("comment.") || type.startsWith("friend.") || type.startsWith("collection.") || type == "support.replied" -> "community"
                type in setOf("blog.published", "changelog.released", "site.announcement") -> "news"
                type in setOf("account.security", "supporter.expiring", "badge.review") -> "account"
                else -> null
            }
            val created = try { java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).apply { timeZone = java.util.TimeZone.getTimeZone("UTC"); isLenient = false }.parse(n.optString("createdAt"))?.time ?: 0L } catch (_: Exception) { 0L }
            val since = maxOf(prefs(c).getLong("accountSince", Long.MAX_VALUE), prefs(c).getLong("since_$group", 0))
            if (id !in seen && created >= since && n.isNull("readAt") && group != null && enabled(c, group)) {
                show(c, group, "account:$id", n.optString("title"), n.optString("body"), "notifications")
            }
            seen.add(id)
        }
        prefs(c).edit().putStringSet("accountSeen", seen.toList().takeLast(300).toSet()).apply()
        }
    }
}

class MobileNotificationWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        val cfg = MobileNotifications.config(applicationContext)
        try { MobileNotifications.snapshot(applicationContext, cfg)?.let { MobileNotifications.observe(applicationContext, it) } } catch (_: Exception) { }
        try { MobileNotifications.account(applicationContext, cfg) } catch (_: Exception) { return Result.retry() }
        return Result.success()
    }
}
