export type INavItem =
  | { label: string; link: string; children?: never; pathToMatch: string; access: 'public' }
  | { label: string; children: { label: string; link: string }[]; link?: never; pathToMatch: string; access: 'protected' };

export const topNavigationItems: INavItem[] = [
  { label: 'Dashboard', link: '/dashboard', pathToMatch: 'dashboard', access: 'public' },
  {
    label: 'Analytics',
    pathToMatch: 'dashboard',
    access: 'protected',
    children: [
      { label: 'Overview', link: '/dashboard/overview' },
      { label: 'Operations', link: '/dashboard/operations' },
      { label: 'Trends', link: '/dashboard/trends' },
      { label: 'Themes', link: '/dashboard/themes' },
      { label: 'Reports', link: '/dashboard/reports' }
    ]
  },
  { label: 'About', link: '/about', pathToMatch: 'about', access: 'public' }
];
