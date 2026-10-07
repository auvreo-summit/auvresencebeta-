/** Future delivery boundary. No provider or outbound email is enabled. */
export interface EmailProvider {
  send(input: { to: string; subject: string; text: string }): Promise<{ status: 'unavailable' | 'sent'; messageId?: string }>;
}
export class UnavailableEmailProvider implements EmailProvider {
  async send(_input: { to: string; subject: string; text: string }): Promise<{ status: 'unavailable' }> {
    return { status: 'unavailable' };
  }
}
export const emailProvider: EmailProvider = new UnavailableEmailProvider();
