import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useLanguage } from '../context/LanguageContext.jsx';

/** Placeholder body for PBO views that are not implemented yet. */
export function PboPlaceholderTab({ messageKey, messageValues }) {
  const { t } = useLanguage();
  let text = t(messageKey);
  if (messageValues && typeof text === 'string') {
    for (const [k, val] of Object.entries(messageValues)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), val);
    }
  }
  return (
    <Box sx={(theme) => ({ paddingTop: theme.spacing(3), paddingX: theme.spacing(2), paddingBottom: theme.spacing(2) })}>
      <Typography variant="body1" color="text.secondary">
        {text}
      </Typography>
    </Box>
  );
}
