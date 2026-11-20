'use client';

import NextLink from 'next/link';
import React from 'react';

import { NavigationContext } from '../runtime/navigation-context';

export const Link: React.FC<React.ComponentProps<typeof NextLink>> = (props) => {
  const { children, ref, onNavigate, ...rest } = props;
  const navigation = React.useContext(NavigationContext);
  const anchor = React.useRef<HTMLAnchorElement>(null);
  React.useImperativeHandle(ref, () => anchor.current!, []);

  return (
    <NextLink
      {...rest}
      ref={anchor}
      onNavigate={(event) => {
        let cancelled = false;
        onNavigate?.({
          preventDefault() {
            cancelled = true;
            event.preventDefault();
          },
        });
        if (cancelled || !anchor.current) return;
        const destination = new URL(anchor.current.href);
        navigation?.beginNavigation(destination.pathname + destination.search);
      }}
    >
      {children}
    </NextLink>
  );
};
