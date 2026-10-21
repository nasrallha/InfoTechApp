// i18n/routing.js
import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';

export const routing = defineRouting({
  locales: ['ar', 'en'],
  defaultLocale: 'ar',
  // localeDetection: false
});

export const { Link, redirect, usePathname, useRouter } = createNavigation(routing);