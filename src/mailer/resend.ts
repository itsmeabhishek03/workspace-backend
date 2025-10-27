//src/mailer/resend.ts
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);

export interface InviteEmailPayload {
  to: string;
  inviterName: string;
  workspaceName: string;
  role: string;
  token: string;
}

export async function sendInviteEmail({
  to,
  inviterName,
  workspaceName,
  role,
  token
}: InviteEmailPayload) {
  const acceptUrl = `${process.env.APP_URL}/invites/accept?token=${token}`;
  const from = process.env.MAIL_FROM || "Acme <no-reply@example.com>";

  const html = `
    <div style="font-family: Arial, sans-serif; line-height:1.6;">
      <h2>You've been invited to join ${workspaceName}</h2>
      <p>${inviterName} has invited you to join the workspace as a <b>${role}</b>.</p>
      <p style="text-align:center;margin:32px 0;">
        <a href="${acceptUrl}"
           style="background:#007bff;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;">
           Accept Invitation
        </a>
      </p>
      <p>If the button doesn’t work, copy and paste this link in your browser:</p>
      <p><a href="${acceptUrl}">${acceptUrl}</a></p>
    </div>
  `;

  const text = `
${inviterName} invited you to join ${workspaceName} as a ${role}.
Open this link to accept: ${acceptUrl}
`;

  try {
    await resend.emails.send({
      from,
      to,
      subject: `Invitation to join ${workspaceName}`,
      html,
      text,
    });
    return { success: true };
  } catch (err: any) {
    console.error("Failed to send invite email:", err);
    return { success: false, error: err.message || "Unknown error" };
  }
}
