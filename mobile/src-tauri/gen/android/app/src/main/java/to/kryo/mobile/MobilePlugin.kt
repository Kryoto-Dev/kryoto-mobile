package to.kryo.mobile

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import android.provider.Settings
import android.util.Base64
import androidx.activity.result.ActivityResult
import androidx.core.app.NotificationManagerCompat
import app.tauri.PermissionState
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONObject
import java.io.OutputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

@InvokeArg
class MobileArgs {
    var config: String = "{}"
    var section: String = "notifications"
}

@InvokeArg
class ChatNotice {
    var title: String = ""
    var body: String = ""
}

@InvokeArg
class ChatPushArgs {
    var gateway: String = ""
}

@InvokeArg
class SaveArgs {
    var name: String = "file"
    var mime: String = ""
    var id: String = ""
    var data: String = ""
    var last: Boolean = false
}

/** A file being written to where the player chose. The page never sees or names the location. */
private class Saving(val uri: Uri, val out: OutputStream)

@TauriPlugin(permissions = [Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications")])
class MobilePlugin(private val activity: Activity) : Plugin(activity) {
    private companion object { const val SAVE_FAILED = "The file could not be saved. Check your free space and try again." }

    private val executor = Executors.newSingleThreadExecutor()
    private val saves = ConcurrentHashMap<String, Saving>()

    @Command
    fun configure(invoke: Invoke) {
        try {
            val config = JSONObject(invoke.parseArgs(MobileArgs::class.java).config)
            MobileNotifications.configure(activity, config)
            invoke.resolve()
        } catch (_: Exception) { invoke.reject("Could not save mobile notification settings.") }
    }

    @Command
    fun observe(invoke: Invoke) {
        try {
            val snapshot = JSONObject(invoke.parseArgs(MobileArgs::class.java).config)
            MobileNotifications.observe(activity, snapshot)
            if (MobileNotifications.hasActiveDownloads(snapshot) && MobileNotifications.enabled(activity, "live")) {
                // This command is sent only while our activity is visible. Never
                // start a foreground service from an Android background job.
                if (activity.hasWindowFocus()) DownloadWatchService.start(activity)
            }
            invoke.resolve()
        } catch (_: Exception) { invoke.reject("Could not follow desktop downloads.") }
    }

    /** A chat message or a ring while the app is out of sight: the engine has decided the words. */
    @Command
    fun chatNotify(invoke: Invoke) {
        val args = invoke.parseArgs(ChatNotice::class.java)
        MobileNotifications.chat(activity, args.title, args.body)
        invoke.resolve()
    }

    /** What the chat engine hands the gateway. */
    @Command
    fun chatPush(invoke: Invoke) {
        val args = invoke.parseArgs(ChatPushArgs::class.java)
        val out = JSObject()
        out.put("endpoint", MobileNotifications.chatEndpoint(activity, args.gateway) ?: JSONObject.NULL)
        invoke.resolve(out)
    }

    /** Android's Save dialog: no storage permission, the same on every version, and Cancel is an answer. */
    @Command
    fun savePick(invoke: Invoke) {
        val args = invoke.parseArgs(SaveArgs::class.java)
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType(args.mime.ifBlank { "application/octet-stream" })
            .putExtra(Intent.EXTRA_TITLE, args.name)
        try { startActivityForResult(invoke, intent, "savePicked") }
        catch (_: Exception) { invoke.reject("This phone has nothing to save files with.") }
    }

    @ActivityCallback
    fun savePicked(invoke: Invoke, result: ActivityResult) {
        val out = JSObject()
        val uri = result.data?.data
        if (result.resultCode == Activity.RESULT_OK && uri != null) {
            try {
                val id = UUID.randomUUID().toString()
                saves[id] = Saving(uri, activity.contentResolver.openOutputStream(uri, "wt")!!)
                out.put("id", id)
            } catch (_: Exception) {
                discard(uri)
                invoke.reject(SAVE_FAILED)
                return
            }
        }
        invoke.resolve(out)
    }

    @Command
    fun saveWrite(invoke: Invoke) {
        val args = invoke.parseArgs(SaveArgs::class.java)
        executor.execute {
            val saving = saves[args.id]
            if (saving == null) { invoke.reject(SAVE_FAILED); return@execute }
            try {
                saving.out.write(Base64.decode(args.data, Base64.DEFAULT))
                if (args.last) {
                    saving.out.close()
                    saves.remove(args.id)
                }
                invoke.resolve()
            } catch (_: Exception) {
                saves.remove(args.id)
                try { saving.out.close() } catch (_: Exception) { }
                discard(saving.uri)
                invoke.reject(SAVE_FAILED)
            }
        }
    }

    /** Half a file is worse than none. */
    private fun discard(uri: Uri) {
        try { DocumentsContract.deleteDocument(activity.contentResolver, uri) } catch (_: Exception) { }
    }

    @Command
    fun poll(invoke: Invoke) {
        executor.execute {
            val cfg = MobileNotifications.config(activity)
            try { MobileNotifications.snapshot(activity, cfg)?.let { MobileNotifications.observe(activity, it) } } catch (_: Exception) { }
            try { MobileNotifications.account(activity, cfg); invoke.resolve() }
            catch (_: Exception) { invoke.reject("Could not check notifications.") }
        }
    }

    @Command
    fun status(invoke: Invoke) {
        val out = JSObject()
        out.put("notifications", NotificationManagerCompat.from(activity).areNotificationsEnabled())
        out.put("localNetwork", Build.VERSION.SDK_INT < 37 || activity.checkSelfPermission("android.permission.ACCESS_LOCAL_NETWORK") == PackageManager.PERMISSION_GRANTED)
        out.put("target", MainActivity.notificationTarget)
        MainActivity.notificationTarget = null
        invoke.resolve(out)
    }

    @Command
    fun enable(invoke: Invoke) {
        MobileNotifications.channels(activity)
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", invoke, "notificationPermission")
        } else status(invoke)
    }

    @PermissionCallback
    fun notificationPermission(invoke: Invoke) = status(invoke)

    @Command
    fun settings(invoke: Invoke) {
        val section = invoke.parseArgs(MobileArgs::class.java).section
        val intent = if (section == "network") {
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${activity.packageName}"))
        } else if (Build.VERSION.SDK_INT >= 26) {
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, activity.packageName)
        } else Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${activity.packageName}"))
        activity.startActivity(intent)
        invoke.resolve()
    }

    @Command
    fun checkUpdate(invoke: Invoke) {
        executor.execute {
            try { invoke.resolve(JSObject(MobileUpdater.check(activity).toString())) }
            catch (_: Exception) { invoke.reject("Could not check for updates. Check your connection and try again.") }
        }
    }

    @Command
    fun installUpdate(invoke: Invoke) {
        if (Build.VERSION.SDK_INT >= 26 && !activity.packageManager.canRequestPackageInstalls()) {
            activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}")))
            invoke.reject("Allow updates from Kryoto, then tap Install update again.")
            return
        }
        executor.execute {
            try {
                val intent = MobileUpdater.prepareInstall(activity)
                activity.runOnUiThread { activity.startActivity(intent); invoke.resolve() }
            } catch (e: Exception) { invoke.reject(e.message ?: "The update could not be installed.") }
        }
    }
}
