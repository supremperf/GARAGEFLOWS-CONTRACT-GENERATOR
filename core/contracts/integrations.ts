/** Future integration ports. No provider is connected by default.
 * Implementation must keep credentials server-side and verify provider confirmations/evidence.
 */
export interface ContractMailTransport {
  sendDocument(input: { recipient: string; subject: string; pdf: Buffer; documentHash: string; idempotencyKey: string }): Promise<{
    messageId: string; acceptedRecipients: string[]; transportConfirmedAt: string;
  }>;
}
export interface SignatureProvider {
  request(input: { document: Buffer; documentHash: string; reference: string; signatories: { name: string; email: string }[] }): Promise<{ requestId: string; provider: string }>;
  verifyEvidence(input: { rawBody: Buffer; headers: Record<string, string> }): Promise<{
    requestId: string; documentHash: string; signedAt: string; identifiedSignatories: string[];
    assurance: 'simple' | 'advanced' | 'qualified'; proof: Buffer; signedDocument: Buffer;
  }>;
}
export interface BillingReader {
  readSubscription(subscriptionId: string): Promise<{
    subscriptionId: string; clientId: string; priceCents: number; currency: 'EUR';
    invoices: { id: string; amountCents: number; dueDate: string; paidAt?: string }[];
  } | null>;
}
export interface ContractProviders {
  email: ContractMailTransport | null; signature: SignatureProvider | null; billing: BillingReader | null;
}
export const DISCONNECTED_PROVIDERS: Readonly<ContractProviders> = Object.freeze({ email: null, signature: null, billing: null });
