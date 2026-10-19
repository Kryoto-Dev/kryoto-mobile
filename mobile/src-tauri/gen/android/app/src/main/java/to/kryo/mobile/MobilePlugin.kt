package to.kryo.mobile

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import app.tauri.PermissionState
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONObject
import java.util.concurrent.Executors

@InvokeArg
class MobileArgs {
    var config: String = "{}"
    var section: String = "notifications"
}

@TauriPlugin(permissions = [Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications")])
class MobilePlugin(private val activity: Activity) : Plugin(activity) {
    private val executor = Executors.newSingleThreadExecutor()

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
