import { useState } from 'react';
import Stack from '@mui/material/Stack';
import { useLanguage } from '../context/LanguageContext.jsx';
import { PageHeader, PrimaryTab } from '../ui/index.js';
import { SocialMediaDailyPanel } from './socialMedia/SocialMediaDailyPanel.jsx';
import { SocialMediaTopicFetchPanel } from './socialMedia/SocialMediaTopicFetchPanel.jsx';

const SUB_TABS = [
  { id: 'daily', labelKey: 'socialMedia.subTab.daily' },
  { id: 'topic', labelKey: 'socialMedia.subTab.topic' },
];

export function SocialMediaTab() {
  const { t } = useLanguage();
  const [subTab, setSubTab] = useState('daily');

  return (
    <Stack spacing={2.5}>
      <PageHeader title={t('tab.socialMedia')} subtitle={t('socialMedia.subtitle')} />

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

      {subTab === 'daily' && <SocialMediaDailyPanel />}
      {subTab === 'topic' && <SocialMediaTopicFetchPanel />}
    </Stack>
  );
}
