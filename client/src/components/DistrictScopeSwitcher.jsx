import { useState } from 'react';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { useLanguage } from '../context/LanguageContext.jsx';
import { ISRAEL_REGIONAL_DISTRICT_ORDER } from '../lib/israelDistricts.js';
import { isDistrictScopeAllowed } from '../lib/clampOperatorDistrictScope.js';
import { REPORT_SCOPE_ORDER } from '../lib/reportScopes.js';
import PropTypes from 'prop-types';

const MENU_ID = 'district-scope-switcher-menu';

/** @param {import('@mui/material/styles').Theme} theme */
function pillDropdownButtonSx(theme) {
  return {
    minWidth: 0,
    minHeight: theme.spacing(4.5),
    paddingTop: theme.spacing(0.75),
    paddingBottom: theme.spacing(0.75),
    paddingLeft: theme.spacing(1.25),
    paddingRight: theme.spacing(1.25),
    fontSize: theme.typography.pill.fontSize,
    borderRadius: `${theme.custom.radius.section}px`,
    color: 'text.secondary',
    borderColor: theme.palette.divider,
    lineHeight: 1.2,
    maxWidth: 220,
    '& .MuiButton-endIcon': {
      marginInlineStart: theme.spacing(0.5),
      marginInlineEnd: 0,
    },
    '&:hover': {
      color: 'text.primary',
      borderColor: theme.palette.divider,
      background: theme.palette.action.hover,
    },
  };
}

/**
 * Home-front district dropdown for operator tabs.
 * @param {'report'|'regional'} mode report = national + 5 districts; regional = districts only
 */
export function DistrictScopeSwitcher({
  value,
  onChange,
  mode = 'report',
  ariaLabelKey = 'report.scope.label',
  districtAccess = null,
}) {
  const { t } = useLanguage();
  const [anchor, setAnchor] = useState(null);
  const open = Boolean(anchor);
  const scopeIds = mode === 'regional' ? ISRAEL_REGIONAL_DISTRICT_ORDER : REPORT_SCOPE_ORDER;

  function allowed(scopeId) {
    return isDistrictScopeAllowed(scopeId, districtAccess);
  }

  function labelFor(scopeId) {
    return scopeId === 'national' ? t('report.scope.national') : t(`district.${scopeId}`);
  }

  return (
    <>
      <Button
        type="button"
        variant="outlined"
        size="small"
        onClick={(e) => setAnchor(e.currentTarget)}
        endIcon={<KeyboardArrowDownIcon fontSize="small" />}
        aria-haspopup="true"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={open ? MENU_ID : undefined}
        aria-label={`${t(ariaLabelKey)}: ${labelFor(value)}`}
        sx={(theme) => ({
          ...pillDropdownButtonSx(theme),
          '& .MuiButton-label': {
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          },
        })}
      >
        {labelFor(value)}
      </Button>
      <Menu
        id={MENU_ID}
        anchorEl={anchor}
        open={open}
        onClose={() => setAnchor(null)}
        slotProps={{ list: { 'aria-label': t(ariaLabelKey) } }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {scopeIds.map((scopeId) => {
          const label = labelFor(scopeId);
          const isAllowed = allowed(scopeId);

          if (isAllowed) {
            return (
              <MenuItem
                key={scopeId}
                selected={value === scopeId}
                onClick={() => {
                  onChange(scopeId);
                  setAnchor(null);
                }}
              >
                {label}
              </MenuItem>
            );
          }

          return (
            <Tooltip key={scopeId} title={t('operator.districtAccess.denied')} placement="left">
              <span>
                <MenuItem selected={value === scopeId} disabled sx={{ opacity: 0.45 }}>
                  {label}
                </MenuItem>
              </span>
            </Tooltip>
          );
        })}
      </Menu>
    </>
  );
}

DistrictScopeSwitcher.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  mode: PropTypes.oneOf(['report', 'regional']),
  ariaLabelKey: PropTypes.string,
  districtAccess: PropTypes.shape({
    enforcementEnabled: PropTypes.bool,
    unrestricted: PropTypes.bool,
    districtIds: PropTypes.arrayOf(PropTypes.string),
  }),
};
