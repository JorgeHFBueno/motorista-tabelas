import { forwardRef } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

// MUI buttons, list items and cards with `href` render this React Router link: a normal click navigates inside the app,
// and the middle button or Ctrl+click opens a new tab, as with any link. Absolute URLs (https:, mailto:) stay plain links.
const LinkRoteador = forwardRef<HTMLAnchorElement, Omit<LinkProps, 'to'> & { href: LinkProps['to'] }>(
  function LinkRoteador({ href, ...props }, ref) {
    return <Link ref={ref} to={href} {...props} />;
  },
);

export default LinkRoteador;
