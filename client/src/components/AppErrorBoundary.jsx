import { Component } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import PropTypes from 'prop-types';

export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <Box
          sx={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            padding: 3,
            background: 'linear-gradient(160deg, #eef3fa 0%, #f4f7fc 45%, #e8f6f3 100%)',
          }}
        >
          <Typography variant="h2" component="h1">
            Something went wrong
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '40ch', textAlign: 'center' }}>
            {error?.message ?? 'Unknown error'}
          </Typography>
          <Button variant="contained" onClick={() => globalThis.location?.reload()}>
            Reload page
          </Button>
        </Box>
      );
    }
    return this.props.children;
  }
}

AppErrorBoundary.propTypes = {
  children: PropTypes.node,
};
