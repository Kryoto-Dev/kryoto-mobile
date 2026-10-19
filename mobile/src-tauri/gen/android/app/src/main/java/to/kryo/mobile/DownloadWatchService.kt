package to.kryo.mobile

import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/** Opt-in, visible tracking only while a desktop download is active. Periodic
 * work covers ordinary background delivery without a permanent service. */
class DownloadWatchService : Service() {
    private val executor = Executors.newSingleThreadScheduledExecutor()
    private var task: ScheduledFuture<*>? = null
    private var misses = 0

    override fun onBind(intent: Intent?): IBinder? = null
    override fun onCreate() { super.onCreate(); running = true }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        MobileNotifications.channels(this)
        val n = NotificationCompat.Builder(this, "watch").setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Following your PC's downloads").setContentText("Tap to open Downloads. Turn off live tracking in Notification settings.")
            .setContentIntent(MobileNotifications.contentIntent(this, "downloads", "watch")).setOnlyAlertOnce(true).setOngoing(true).build()
        startForeground(4101, n)
        if (task == null) task = executor.scheduleWithFixedDelay({
            try {
                if (!MobileNotifications.enabled(this, "live")) { stopSelf(); return@scheduleWithFixedDelay }
                val s = MobileNotifications.snapshot(this)
                if (s == null) { if (++misses >= 5) stopSelf(); return@scheduleWithFixedDelay }
                misses = 0
                MobileNotifications.observe(this, s)
                if (!MobileNotifications.hasActiveDownloads(s)) stopSelf()
            } catch (_: Exception) { if (++misses >= 5) stopSelf() }
        }, 0, 5, TimeUnit.SECONDS)
        return START_NOT_STICKY
    }

    override fun onTimeout(startId: Int, fgsType: Int) { stopSelf() }
    override fun onDestroy() { running = false; task?.cancel(true); executor.shutdownNow(); stopForeground(STOP_FOREGROUND_REMOVE); super.onDestroy() }

    companion object {
        @Volatile private var running = false
        fun start(c: Context) {
            if (running || !androidx.core.app.NotificationManagerCompat.from(c).areNotificationsEnabled()) return
            try { ContextCompat.startForegroundService(c, Intent(c, DownloadWatchService::class.java)) } catch (_: RuntimeException) { }
        }
    }
}
