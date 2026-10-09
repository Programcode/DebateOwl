import type { IconName } from './icon-paths';

/** The five tabs from the mocks, in order. `name` is the route group under src/app/(tabs). */
export const TABS = [
  { name: '(debate)', href: '/', label: 'mobile.tabs.debate', icon: 'target', image: require('@/assets/tab-icons/target.png') },
  { name: '(prepare)', href: '/prepare', label: 'mobile.tabs.prepare', icon: 'sparkles', image: require('@/assets/tab-icons/sparkles.png') },
  { name: '(practice)', href: '/practice', label: 'mobile.tabs.practice', icon: 'swords', image: require('@/assets/tab-icons/swords.png') },
  { name: '(library)', href: '/library', label: 'mobile.tabs.library', icon: 'library', image: require('@/assets/tab-icons/library.png') },
  { name: '(you)', href: '/you', label: 'mobile.tabs.you', icon: 'user', image: require('@/assets/tab-icons/user.png') },
] as const satisfies readonly { name: string; href: string; label: string; icon: IconName; image: number }[];
