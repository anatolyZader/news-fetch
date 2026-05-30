import { useCallback, useState } from 'react';
import PropTypes from 'prop-types';
import MenuIcon from '@mui/icons-material/Menu';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { fetchTopicFetchHistory } from '../../hooks/useSocialMedia.js';
import { formatDate } from '../../lib/date.js';

function formatFetchedAt(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${formatDate(date)} ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

/** @param {{ activeId?: string|null, onSelect: (search: object) => void, disabled?: boolean }} props */
export function SocialMediaPreviousSearchesMenu({ activeId, onSelect, disabled = false }) {
  const { t } = useLanguage();
  const { apiReady, getIdToken, getAppCheckToken } = useAuth();
  const [anchorEl, setAnchorEl] = useState(null);
  const [searches, setSearches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const open = Boolean(anchorEl);

  const reloadHistory = useCallback(async () => {
    if (!apiReady) return;
    setLoading(true);
    setLoadError(null);
    try {
      setSearches(await fetchTopicFetchHistory({ getIdToken, getAppCheckToken }));
    } catch (e) {
      setLoadError(e?.message ?? t('socialMedia.topic.historyFailed'));
      setSearches([]);
    } finally {
      setLoading(false);
    }
  }, [apiReady, getIdToken, t]);

  const handleOpen = (event) => {
    setAnchorEl(event.currentTarget);
    reloadHistory().catch(() => {});
  };

  const handleClose = () => setAnchorEl(null);

  const handleSelect = (search) => {
    handleClose();
    onSelect(search);
  };

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        startIcon={<MenuIcon />}
        onClick={handleOpen}
        disabled={disabled || !apiReady}
        aria-haspopup="true"
        aria-expanded={open ? 'true' : undefined}
        aria-controls={open ? 'social-media-previous-searches-menu' : undefined}
        sx={{ flexShrink: 0 }}
      >
        {t('socialMedia.topic.previousSearches')}
      </Button>

      <Menu
        id="social-media-previous-searches-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        slotProps={{ paper: { sx: { maxWidth: 420, maxHeight: 360 } } }}
      >
        {loading && (
          <MenuItem disabled sx={{ justifyContent: 'center' }}>
            <CircularProgress size={20} />
          </MenuItem>
        )}

        {!loading && loadError && (
          <MenuItem disabled>
            <Typography variant="body2" color="error">
              {loadError}
            </Typography>
          </MenuItem>
        )}

        {!loading && !loadError && searches.length === 0 && (
          <MenuItem disabled>
            <Typography variant="body2" color="text.secondary">
              {t('socialMedia.topic.noPreviousSearches')}
            </Typography>
          </MenuItem>
        )}

        {!loading && searches.map((search) => (
          <MenuItem
            key={search.id}
            selected={search.id === activeId}
            onClick={() => handleSelect(search)}
            sx={{ alignItems: 'flex-start', whiteSpace: 'normal' }}
          >
            <ListItemText
              primary={search.topic}
              secondary={(t('socialMedia.topic.historyItemMeta') || '')
                .replace('{date}', formatFetchedAt(search.fetchedAt))
                .replace('{count}', String(search.postCount ?? 0))}
              primaryTypographyProps={{ variant: 'body2', sx: { fontWeight: search.id === activeId ? 600 : 400 } }}
              secondaryTypographyProps={{ variant: 'caption' }}
            />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

SocialMediaPreviousSearchesMenu.propTypes = {
  activeId: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};
