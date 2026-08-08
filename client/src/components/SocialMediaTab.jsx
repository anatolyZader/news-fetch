import { useState } from 'react';
import Stack from '@mui/material/Stack';
import PropTypes from 'prop-types';
import { useLanguage } from '../context/LanguageContext.jsx';
import { PageHeader, PrimaryTab } from '../ui/index.js';
import { DistrictScopeSwitcher } from './DistrictScopeSwitcher.jsx';
import { SocialMediaDailyPanel } from './socialMedia/SocialMediaDailyPanel.jsx';
import { SocialMediaTopicFetchPanel } from './socialMedia/SocialMediaTopicFetchPanel.jsx';

const SUB_TABS = [
  { id: 'daily', labelKey: 'socialMedia.subTab.daily' },
  { id: 'topic', labelKey: 'socialMedia.subTab.topic' },
];

export function SocialMediaTab({
  userScope = 'national',
  onUserScopeChange,
  districtAccess = null,
}) {
  const { t } = useLanguage();
  const [subTab, setSubTab] = useState('daily');

  const districtScope = onUserScopeChange ? (
    <DistrictScopeSwitcher
      value={userScope}
      onChange={onUserScopeChange}
      districtAccess={districtAccess}
    />
  ) : null;

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title={t('tab.socialMedia')}
        subtitle={t('socialMedia.subtitle')}
        scope={districtScope}
      />

      <Stack
        component="nav"
        direction="row"
        aria-label={t('tab.socialMedia')}
        sx={(theme) => ({
          borderBottom: theme.custom.border.hairline,
        })}
      >
        {SUB_TABS.map((tab) => (
          <PrimaryTab
            key={tab.id}
            compact
            active={subTab === tab.id}
            onClick={() => setSubTab(tab.id)}
          >
            {t(tab.labelKey)}
          </PrimaryTab>
        ))}
      </Stack>

      {subTab === 'daily' && (
        <SocialMediaDailyPanel userScope={userScope} />
      )}
      {subTab === 'topic' && <SocialMediaTopicFetchPanel />}
    </Stack>
  );
}

SocialMediaTab.propTypes = {
  userScope: PropTypes.string,
  onUserScopeChange: PropTypes.func,
  districtAccess: PropTypes.object,
};
