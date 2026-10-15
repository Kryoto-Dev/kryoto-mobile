package to.kryo.mobile

import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  private var webView: WebView? = null
  private var insetsJson = """{"top":0,"bottom":0,"left":0,"right":0}"""

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    trackSystemBars()
    requestLocalNetworkAccess()
  }

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
    webView.addJavascriptInterface(Bars(), "KryoBars")
  }

  // The app draws under the status bar, the camera cut-out and the gesture bar,
  // so its content shows through behind them as it scrolls. The WebView does
  // not report those bars to the page (env(safe-area-inset-*) stays 0), so
  // their sizes go to it as CSS pixels (src/mobile/bars.ts). Only the keyboard
  // still shrinks the view, so the field being typed in stays in sight.
  private fun trackSystemBars() {
    val content = findViewById<View>(android.R.id.content)
    content.setBackgroundColor(Color.BLACK)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
      view.setPadding(0, 0, 0, keyboard)
      val density = resources.displayMetrics.density
      val bottom = if (keyboard > 0) 0f else bars.bottom / density
      insetsJson = """{"top":${bars.top / density},"bottom":$bottom,"left":${bars.left / density},"right":${bars.right / density}}"""
      webView?.evaluateJavascript("window.__kryoInsets&&window.__kryoInsets($insetsJson)", null)
      WindowInsetsCompat.CONSUMED
    }
  }

  // What the page can ask of the system bars: how far in to stay, and whether
  // their icons should be dark (a light theme) or light (a dark one).
  inner class Bars {
    @JavascriptInterface
    fun insets(): String = insetsJson

    @JavascriptInterface
    fun light(on: Boolean) {
      runOnUiThread {
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.isAppearanceLightStatusBars = on
        controller.isAppearanceLightNavigationBars = on
      }
    }
  }

  // Android 17 stops an app that targets it from reaching devices on the home
  // network (the PC's Kryoto server) until the player allows "local network".
  private fun requestLocalNetworkAccess() {
    if (Build.VERSION.SDK_INT < 37) return
    val permission = "android.permission.ACCESS_LOCAL_NETWORK"
    if (checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) {
      requestPermissions(arrayOf(permission), 1)
    }
  }
}
