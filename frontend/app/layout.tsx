import './globals.css';

export const metadata = {
  title: 'KERO',
  description: 'KERO Yapay Zekâ Asistanı',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
