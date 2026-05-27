import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import PropTypes from 'prop-types';

function MutedTypography({ children }) {
  return (
    <Typography variant="body2" color="text.secondary">
      {children}
    </Typography>
  );
}

MutedTypography.propTypes = {
  children: PropTypes.node,
};

export function LoadingState({ children = 'Loading...' }) {
  return <MutedTypography>{children}</MutedTypography>;
}

LoadingState.propTypes = {
  children: PropTypes.node,
};

export function ErrorState({ children }) {
  return (
    <Alert severity="error" variant="standard" sx={{ alignItems: 'center' }}>
      {children}
    </Alert>
  );
}

ErrorState.propTypes = {
  children: PropTypes.node,
};

export function EmptyState({ children }) {
  return <MutedTypography>{children}</MutedTypography>;
}

EmptyState.propTypes = {
  children: PropTypes.node,
};
