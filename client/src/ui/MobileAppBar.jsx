import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import MenuIcon from '@mui/icons-material/Menu';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';
import PropTypes from 'prop-types';

import { BrandHeader } from './BrandHeader.jsx';

/**
 * Phone app bar: menu | brand | notification bell.
 */
export function MobileAppBar({
  title,
  subtitle,
  logoSrc,
  logoAlt,
  onHomeClick,
  homeAriaLabel,
  onMenuClick,
  onNotificationClick,
  notificationAriaLabel,
}) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      sx={{ width: '100%', minWidth: 0 }}
    >
      <IconButton
        type="button"
        edge="start"
        aria-label={onMenuClick ? 'Menu' : undefined}
        onClick={onMenuClick}
        sx={{ flexShrink: 0 }}
      >
        <MenuIcon />
      </IconButton>
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <BrandHeader
          variant="compact"
          align="center"
          title={title}
          subtitle={subtitle}
          logoSrc={logoSrc}
          logoAlt={logoAlt}
          onHomeClick={onHomeClick}
          homeAriaLabel={homeAriaLabel}
        />
      </Box>
      <IconButton
        type="button"
        edge="end"
        aria-label={notificationAriaLabel}
        onClick={onNotificationClick}
        sx={{ flexShrink: 0 }}
      >
        <NotificationsNoneOutlinedIcon />
      </IconButton>
    </Stack>
  );
}

MobileAppBar.propTypes = {
  title: PropTypes.node.isRequired,
  subtitle: PropTypes.node,
  logoSrc: PropTypes.string,
  logoAlt: PropTypes.string,
  onHomeClick: PropTypes.func,
  homeAriaLabel: PropTypes.string,
  onMenuClick: PropTypes.func.isRequired,
  onNotificationClick: PropTypes.func,
  notificationAriaLabel: PropTypes.string,
};
