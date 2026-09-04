import { Body, Container, Head, Heading, Hr, Html, Preview, Text } from '@react-email/components';

export interface PreorderUpdateProps {
  orgName: string;
  customerName: string | null;
  windowName: string;
  kind: 'closed' | 'arrived';
  expectedDeliveryOn?: string | null;
  items: { name: string; variant: string; quantity: number }[];
  fulfillment: string;
  contactEmail?: string | null;
}

export function PreorderUpdateEmail(p: PreorderUpdateProps) {
  const title =
    p.kind === 'closed' ? `Your ${p.windowName} pre-order is in!` : `Your ${p.windowName} items have arrived`;
  return (
    <Html>
      <Head />
      <Preview>{title}</Preview>
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
            {title}
          </Heading>
          <Text style={{ color: '#555', margin: 0 }}>
            Hi {(p.customerName ?? 'there').split(' ')[0]},{' '}
            {p.kind === 'closed'
              ? `the pre-order window has closed and ${p.orgName} has placed the order with our vendor.${p.expectedDeliveryOn ? ` We expect delivery around ${p.expectedDeliveryOn}.` : ''}`
              : `your items are here and will be handed out shortly.`}
          </Text>
          <Hr />
          {p.items.map((i, idx) => (
            <Text key={idx} style={{ margin: '2px 0' }}>
              {i.quantity} × {i.name} ({i.variant})
            </Text>
          ))}
          <Hr />
          <Text style={{ margin: 0 }}>{p.fulfillment}</Text>
          {p.contactEmail && (
            <Text style={{ color: '#888', fontSize: 12 }}>Questions? Email {p.contactEmail}.</Text>
          )}
        </Container>
      </Body>
    </Html>
  );
}
