import { Body, Container, Head, Heading, Hr, Html, Preview, Section, Text } from '@react-email/components';
import { formatCents } from '@/lib/money';

export interface ReceiptLine {
  name: string;
  variant: string;
  quantity: number;
  lineSubtotalCents: number;
  isPreorder: boolean;
}

export interface ReceiptProps {
  orgName: string;
  orderNumber: string;
  customerName: string;
  lines: ReceiptLine[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  fulfillment: string;
  cardLast4?: string | null;
  orderUrl: string;
  contactEmail?: string | null;
}

export function ReceiptEmail(p: ReceiptProps) {
  const now = p.lines.filter((l) => !l.isPreorder);
  const later = p.lines.filter((l) => l.isPreorder);
  return (
    <Html>
      <Head />
      <Preview>{`${p.orgName} order ${p.orderNumber} — thank you!`}</Preview>
      <Body
        style={{
          fontFamily: 'Helvetica, Arial, sans-serif',
          background: '#f6f6f6',
          margin: 0,
          padding: '24px 0',
        }}
      >
        <Container style={{ background: '#fff', borderRadius: 8, padding: 24, maxWidth: 560 }}>
          <Heading as="h2" style={{ margin: '0 0 8px' }}>
            Thanks, {p.customerName.split(' ')[0]}!
          </Heading>
          <Text style={{ margin: 0, color: '#555' }}>
            Order <strong>{p.orderNumber}</strong> from {p.orgName}
            {p.cardLast4 ? ` · card ending ${p.cardLast4}` : ''}
          </Text>
          <Hr />
          {now.length > 0 && (
            <Section>
              <Text style={{ fontWeight: 700, margin: '0 0 4px' }}>Ready now</Text>
              {now.map((l, i) => (
                <Text key={i} style={{ margin: '2px 0' }}>
                  {l.quantity} × {l.name} ({l.variant}) — {formatCents(l.lineSubtotalCents)}
                </Text>
              ))}
            </Section>
          )}
          {later.length > 0 && (
            <Section>
              <Text style={{ fontWeight: 700, margin: '12px 0 4px' }}>
                Pre-ordered (arrives after the window closes)
              </Text>
              {later.map((l, i) => (
                <Text key={i} style={{ margin: '2px 0' }}>
                  {l.quantity} × {l.name} ({l.variant}) — {formatCents(l.lineSubtotalCents)}
                </Text>
              ))}
            </Section>
          )}
          <Hr />
          <Text style={{ margin: '2px 0' }}>Subtotal: {formatCents(p.subtotalCents)}</Text>
          {p.taxCents > 0 && <Text style={{ margin: '2px 0' }}>Tax: {formatCents(p.taxCents)}</Text>}
          <Text style={{ margin: '2px 0', fontWeight: 700 }}>Total: {formatCents(p.totalCents)}</Text>
          <Hr />
          <Text style={{ margin: 0 }}>{p.fulfillment}</Text>
          <Text style={{ color: '#555' }}>
            View your order: <a href={p.orderUrl}>{p.orderUrl}</a>
          </Text>
          {p.contactEmail && (
            <Text style={{ color: '#888', fontSize: 12 }}>Questions? Email {p.contactEmail}.</Text>
          )}
        </Container>
      </Body>
    </Html>
  );
}
