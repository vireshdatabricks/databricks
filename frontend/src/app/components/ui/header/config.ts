export type INavItem =
  | { label: string; link: string; children?: never; pathToMatch: string; access: 'public' }
  | { label: string; children: { label: string; link: string }[]; link?: never; pathToMatch: string; access: 'protected' };
