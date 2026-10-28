/**
 * nodemailer-stub-transport ships no types. Build-time only, not copied to
 * dist: the public stub types live in types.d.ts, and `mailTransports` in
 * index.ts checks that this declaration matches them.
 */
declare module 'nodemailer-stub-transport' {
  import type { Transport } from 'nodemailer';
  import type { MimeNodeEnvelope } from 'nodemailer/lib/mime-node';

  export default function stubTransport(options?: {
    error?: string;
    keepBcc?: boolean;
  }): Transport<{
    envelope: MimeNodeEnvelope;
    messageId: string;
    response: Buffer;
  }>;
}
