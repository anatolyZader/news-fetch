import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';

export function LoadingState({ children = 'Loading...' }) {
  return (
    <Typography variant="body2" color="text.secondary">
      {children}
    </Typography>
  );
}

export function ErrorState({ children }) {
  return (
    <Alert severity="error" variant="standard" sx={{ alignItems: 'center' }}>
      {children}
    </Alert>
  );
}

export function EmptyState({ children }) {
  return (
    <Typography variant="body2" color="text.secondary">
      {children}
    </Typography>
  );
}
