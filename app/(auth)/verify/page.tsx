import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function VerifyPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm items-center px-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            We sent you a sign-in link. It expires in 24 hours. You can close this tab.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Didn&apos;t get it? Check spam, or ask an admin to confirm your email is on the volunteer list.
        </CardContent>
      </Card>
    </main>
  );
}
