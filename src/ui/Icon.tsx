const P: Record<string, string> = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10v9a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-9M10 20v-4.5h4V20',
  clipboard: 'M5 4.5h14v16H5zM9 3.5h6v3H9zM9 11h6M9 15h4',
  calendar: 'M4 5.5h16v15H4zM4 10h16M8.5 3.5v4M15.5 3.5v4',
  bell: 'M18 9a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16S18 14 18 9M13.7 19a2 2 0 0 1-3.4 0',
  plus: 'M12 5.5v13M5.5 12h13',
  minus: 'M6 12h12',
  pin: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11M12 12.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2',
  flag: 'M6 21V4M6 4.5h11l-2.2 3.8L17 12H6z',
  weight: 'M6.5 8.5h11l2 12h-15zM12 8.1a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2',
  clock: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17M12 7.5V12l3 2',
  road: 'M6 21 8 3M18 21l-2-18M12 4v3M12 11v3M12 18v3',
  comment:
    'M20.5 12.5c0 4-3.8 7.2-8.5 7.2-1.1 0-2.2-.2-3.2-.5L4 21l1.6-4A6.9 6.9 0 0 1 3.5 12.5c0-4 3.8-7.2 8.5-7.2s8.5 3.2 8.5 7.2z',
  cube: 'm12 3 8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  star: 'm12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
  leaf: 'M4.5 19.5C4.5 11 10 6.5 19.5 6.5c0 9-4.8 13-11 13H4.5zM9 15c1.8-2.6 4-4.4 7-5.5',
  mic: 'M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3',
  wave: 'M4 11v2M8 8.5v7M12 5.5v13M16 8.5v7M20 11v2',
  phone:
    'M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2C11.5 22 3 13.5 3 6.7A2 2 0 0 1 5 4.5z',
  chat: 'M20.5 12.5c0 4-3.8 7.2-8.5 7.2-1.1 0-2.2-.2-3.2-.5L4 21l1.6-4A6.9 6.9 0 0 1 3.5 12.5c0-4 3.8-7.2 8.5-7.2s8.5 3.2 8.5 7.2z',
  sparkle: 'M12 3.5 13.8 9 19.5 11l-5.7 2-1.8 5.5L10.2 13 4.5 11l5.7-2z',
  back: 'M14.5 5.5 8 12l6.5 6.5',
  next: 'M9.5 5.5 16 12l-6.5 6.5',
  search: 'M11 17.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13M16 16l4.5 4.5',
  weather: 'M8 16.5a4 4 0 1 1 .8-7.9A5 5 0 1 1 17 14M6 20h12',
  truck: 'M3 7h10v9H3zM13 10.5h4l3 3V16h-7zM7 19.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4M17 19.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  info: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17M12 11v5.5M12 7.8v.2',
  trash: 'M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l1 13a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1l1-13M10 10.5v6M14 10.5v6',
  x: 'M6 6l12 12M18 6 6 18',
  refresh: 'M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5',
}

export type IconName = keyof typeof P

export function Icon({
  name,
  size = 20,
  className = '',
  strokeWidth = 2,
}: {
  name: IconName
  size?: number
  className?: string
  strokeWidth?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={P[name]} />
    </svg>
  )
}
