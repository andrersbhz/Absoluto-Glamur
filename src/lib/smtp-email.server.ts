import net from "node:net";
import tls from "node:tls";
import { randomBytes, randomUUID } from "node:crypto";

export type SmtpSecurity = "ssl_tls" | "starttls" | "none";

export type SmtpConfig = {
  host: string;
  port: number;
  security: SmtpSecurity;
  username: string;
  password: string;
  fromEmail: string;
  fromName?: string | null;
  replyTo?: string | null;
};

export type SmtpMessage = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
};

type SmtpSocket = net.Socket | tls.TLSSocket;

type SmtpResponse = {
  code: number;
  raw: string;
};

function cleanHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function mimeWord(value: string) {
  const clean = cleanHeader(value);
  if (/^[\x20-\x7E]*$/.test(clean)) return clean;
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

function dotStuff(value: string) {
  return value.replace(/(^|\r?\n)\./g, "$1..");
}

function buildMime(config: SmtpConfig, message: SmtpMessage) {
  const to = (Array.isArray(message.to) ? message.to : [message.to]).map(cleanHeader);
  const fromName = config.fromName ? `${mimeWord(config.fromName)} ` : "";
  const boundary = `ag-${randomBytes(12).toString("hex")}`;
  const subject = mimeWord(message.subject);
  const text = message.text ?? "";
  const html = message.html ?? "";

  const headers = [
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@${cleanHeader(config.fromEmail).split("@")[1] || "absolutoglamur.com.br"}>`,
    `From: ${fromName}<${cleanHeader(config.fromEmail)}>` ,
    `To: ${to.join(", ")}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
  ];

  if (config.replyTo) headers.push(`Reply-To: ${cleanHeader(config.replyTo)}`);

  if (html && text) {
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    return [
      ...headers,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      text,
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      html,
      `--${boundary}--`,
      "",
    ].join("\r\n");
  }

  if (html) {
    headers.push("Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: 8bit");
    return [...headers, "", html, ""].join("\r\n");
  }

  headers.push("Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit");
  return [...headers, "", text, ""].join("\r\n");
}

function waitForSocket(socket: SmtpSocket, event: "connect" | "secureConnect", timeoutMs = 12_000) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error("Tempo esgotado ao conectar ao servidor SMTP.")), timeoutMs);
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off(event, onReady as never);
      socket.off("error", onError);
    };
    const finish = (error?: Error) => {
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onReady = () => finish();
    const onError = (error: Error) => finish(error);
    socket.once(event, onReady as never);
    socket.once("error", onError);
  });
}

function readResponse(socket: SmtpSocket, timeoutMs = 12_000) {
  return new Promise<SmtpResponse>((resolve, reject) => {
    let buffer = "";
    const timeout = setTimeout(() => finish(new Error("Tempo esgotado aguardando resposta do SMTP.")), timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
    };

    const finish = (error?: Error, response?: SmtpResponse) => {
      cleanup();
      if (error) reject(error);
      else if (response) resolve(response);
    };

    const onData = (chunk: Buffer | string) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const final = [...lines].reverse().find((line) => /^\d{3} /.test(line));
      if (!final) return;
      finish(undefined, { code: Number(final.slice(0, 3)), raw: buffer.trim() });
    };

    const onError = (error: Error) => finish(error);
    const onClose = () => finish(new Error("Conexão SMTP encerrada antes da resposta."));

    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
}

async function command(socket: SmtpSocket, value: string, expected: number | number[]) {
  const responsePromise = readResponse(socket);
  socket.write(`${value}\r\n`);
  const response = await responsePromise;
  const accepted = Array.isArray(expected) ? expected : [expected];
  if (!accepted.includes(response.code)) {
    throw new Error(`SMTP respondeu ${response.code}: ${response.raw}`);
  }
  return response;
}

export async function sendSmtpEmail(config: SmtpConfig, message: SmtpMessage) {
  const recipients = (Array.isArray(message.to) ? message.to : [message.to])
    .map((value) => value.trim())
    .filter(Boolean);
  if (!recipients.length) throw new Error("Informe ao menos um destinatário.");

  let socket: SmtpSocket;

  if (config.security === "ssl_tls") {
    const secure = tls.connect({
      host: config.host,
      port: config.port,
      servername: config.host,
      rejectUnauthorized: true,
    });
    socket = secure;
    await waitForSocket(socket, "secureConnect");
  } else {
    const plain = net.connect({ host: config.host, port: config.port });
    socket = plain;
    await waitForSocket(socket, "connect");
  }

  try {
    const greeting = await readResponse(socket);
    if (greeting.code !== 220) throw new Error(`SMTP recusou a conexão: ${greeting.raw}`);

    await command(socket, "EHLO absolutoglamur.com.br", 250);

    if (config.security === "starttls") {
      await command(socket, "STARTTLS", 220);
      const secure = tls.connect({
        socket: socket as net.Socket,
        servername: config.host,
        rejectUnauthorized: true,
      });
      socket = secure;
      await waitForSocket(socket, "secureConnect");
      await command(socket, "EHLO absolutoglamur.com.br", 250);
    }

    if (config.username) {
      await command(socket, "AUTH LOGIN", 334);
      await command(socket, Buffer.from(config.username, "utf8").toString("base64"), 334);
      await command(socket, Buffer.from(config.password, "utf8").toString("base64"), 235);
    }

    await command(socket, `MAIL FROM:<${cleanHeader(config.fromEmail)}>`, 250);
    for (const recipient of recipients) {
      await command(socket, `RCPT TO:<${cleanHeader(recipient)}>`, [250, 251]);
    }

    await command(socket, "DATA", 354);
    const mime = dotStuff(buildMime(config, message));
    const responsePromise = readResponse(socket, 20_000);
    socket.write(`${mime}\r\n.\r\n`);
    const sent = await responsePromise;
    if (sent.code !== 250) throw new Error(`SMTP não aceitou a mensagem: ${sent.raw}`);

    try {
      await command(socket, "QUIT", 221);
    } catch {
      // A mensagem já foi aceita; falha no QUIT não invalida o envio.
    }

    return { ok: true as const, response: sent.raw };
  } finally {
    if (!socket.destroyed) socket.end();
  }
}
