import { Oswald } from 'next/font/google';
import './globals.css';

const oswald = Oswald({ subsets: ['latin'], weight: ['400', '500', '600', '700'] });

export const metadata = { title: 'Stream Calendar' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={oswald.className}>{children}</body>
    </html>
  );
}
