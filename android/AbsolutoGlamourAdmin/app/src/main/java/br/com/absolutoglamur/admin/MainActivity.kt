package br.com.absolutoglamur.admin

import android.app.Activity
import android.os.Bundle
import android.graphics.Color
import android.net.Uri
import android.content.Intent
import android.webkit.CookieManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.view.View

/** Isolated authenticated admin shell; never communicates with Nubank directly. */
class MainActivity : Activity() {
 private lateinit var web: WebView
 private lateinit var offline: LinearLayout
 private val storeHost = "absolutoglamur.com.br"
 private val startUrl = "https://absolutoglamur.com.br/admin/manual-pix"

 override fun onCreate(savedInstanceState: Bundle?) {
  super.onCreate(savedInstanceState)
  window.statusBarColor = Color.rgb(13,18,14)
  window.navigationBarColor = Color.rgb(13,18,14)
  val root = android.widget.FrameLayout(this)
  web = WebView(this)
  web.setBackgroundColor(Color.rgb(13,18,14))
  web.settings.javaScriptEnabled = true
  web.settings.domStorageEnabled = true
  web.settings.allowFileAccess = false
  web.settings.allowContentAccess = false
  web.settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
  web.settings.setSupportMultipleWindows(false)
  CookieManager.getInstance().setAcceptCookie(true)
  CookieManager.getInstance().setAcceptThirdPartyCookies(web,false)
  offline = LinearLayout(this).apply {
   orientation = LinearLayout.VERTICAL
   setBackgroundColor(Color.rgb(13,18,14))
   setPadding(36,72,36,36)
   visibility = View.GONE
  }
  val title = TextView(this).apply {
   text = "Sem conexão com a loja"
   textSize = 22f
   setTextColor(Color.WHITE)
  }
  val detail = TextView(this).apply {
   text = "Verifique a internet e tente novamente. Nenhum pagamento foi aprovado."
   textSize = 15f
   setTextColor(Color.LTGRAY)
  }
  val retry = Button(this).apply {
   text = "Tentar novamente"
   setOnClickListener { offline.visibility=View.GONE; web.loadUrl(startUrl) }
  }
  offline.addView(title);offline.addView(detail);offline.addView(retry)
  root.addView(web)
  root.addView(offline)
  web.webViewClient = object : WebViewClient() {
   override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
    val uri=request.url
    if(uri.scheme == "https" && (uri.host == storeHost || uri.host == "www.$storeHost")) return false
    // External login links use the system browser. Do not embed third-party login pages.
    if(uri.scheme == "https") {
     startActivity(Intent(Intent.ACTION_VIEW,uri))
    }
    return true
   }
   override fun onReceivedError(view: WebView,request: WebResourceRequest,error: WebResourceError) {
    if(request.isForMainFrame) offline.visibility=View.VISIBLE
   }
  }
  setContentView(root)
  if(savedInstanceState==null) web.loadUrl(startUrl) else web.restoreState(savedInstanceState)
 }
 override fun onSaveInstanceState(outState: Bundle) {web.saveState(outState);super.onSaveInstanceState(outState)}
 override fun onPause() {web.onPause();super.onPause()}
 override fun onResume() {super.onResume();web.onResume()}
 @Deprecated("Deprecated in Java")
 override fun onBackPressed() {if(web.canGoBack()) web.goBack() else super.onBackPressed()}
 override fun onDestroy() {web.destroy();super.onDestroy()}
}
