import nodemailer from 'nodemailer';

export class MailService {
  /**
   * Sends a real verification email via SMTP if configured, otherwise logs to console as mock.
   */
  static async sendVerificationEmail(email: string, token: string) {
    const verifyUrl = `http://localhost:5000/api/auth/verify/${token}`;
    console.log(`[Email Verification] Verification link generated for ${email}: ${verifyUrl}`);

    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587');
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM || '"Stuffy Supermarket" <no-reply@stuffy.com>';

    if (!host || !user || !pass) {
      console.log('[MailService] SMTP server is not configured. (To send real emails, set SMTP_HOST, SMTP_USER, SMTP_PASS in your .env). Running in mock mode.');
      return;
    }

    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465, // True for 465, false for other ports
        auth: {
          user,
          pass,
        },
      });

      const mailOptions = {
        from,
        to: email,
        subject: 'Xác thực tài khoản Stuffy Supermarket của bạn',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff; color: #1e293b;">
            <h2 style="color: #6366f1; text-align: center; margin-bottom: 20px;">Chào mừng bạn đến với Stuffy Supermarket!</h2>
            <p>Cảm ơn bạn đã đăng ký tài khoản. Vui lòng nhấn vào nút bên dưới để hoàn tất việc xác thực email của bạn:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verifyUrl}" style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; box-shadow: 0 4px 6px -1px rgba(99, 102, 241, 0.4);">Xác thực Email</a>
            </div>
            <p style="color: #64748b; font-size: 0.9rem;">Nếu nút trên không hoạt động, bạn có thể sao chép và dán liên kết này vào thanh địa chỉ trình duyệt:</p>
            <p style="color: #6366f1; font-size: 0.9rem; word-break: break-all;">${verifyUrl}</p>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 25px 0;">
            <p style="color: #94a3b8; font-size: 0.8rem; text-align: center; margin: 0;">Đây là email tự động, vui lòng không phản hồi email này.</p>
          </div>
        `,
      };

      await transporter.sendMail(mailOptions);
      console.log(`[MailService] Real verification email successfully sent to ${email} via SMTP.`);
    } catch (err: any) {
      console.error('[MailService] Failed to send real email via SMTP:', err.message);
    }
  }
}
