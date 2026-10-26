package br.com.absolutoglamur.admin

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Firebase Messaging service. Requires Firebase project, google-services.json,
 * manifest registration and Firebase Messaging dependencies before compiling.
 * Push notifications are informational only; obtain authenticated order state
 * from the backend when the admin opens the app.
 */
class NotificationsService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        // Register token only via an authenticated admin-only backend endpoint.
        // Do not post it without valid Supabase admin session and permission checks.
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        val type = message.data["type"] ?: return
        if (type !in setOf("payment_confirmed", "order_created", "payment_expired")) return

        val channelId = "sales_updates"
        val manager = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(channelId, "Vendas e pagamentos", NotificationManager.IMPORTANCE_HIGH)
            )
        }
        val title = when (type) {
            "payment_confirmed" -> "Pagamento Pix confirmado"
            "order_created" -> "Novo pedido"
            else -> "Pagamento expirado"
        }
        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText("Abra o aplicativo para consultar os detalhes com segurança.")
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
        manager.notify((System.currentTimeMillis() % Int.MAX_VALUE).toInt(), notification)
    }
}
