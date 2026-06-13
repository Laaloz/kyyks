import "server-only";

type TransactionalEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

type TransactionalEmailResult =
  | { ok: true }
  | { ok: false; message: string };

function getEmailConfig() {
  return {
    apiKey: process.env.RESEND_API_KEY ?? "",
    from: process.env.EMAIL_FROM ?? "",
  };
}

export async function sendTransactionalEmail(input: TransactionalEmailInput): Promise<TransactionalEmailResult> {
  const config = getEmailConfig();

  if (!config.apiKey || !config.from) {
    return { ok: false, message: "Sähköpostipalvelua ei ole konfiguroitu." };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    return {
      ok: false,
      message: `Sähköpostin lähetys epäonnistui: ${body || response.statusText}`,
    };
  }

  return { ok: true };
}
