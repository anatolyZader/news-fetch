import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebar: SidebarsConfig = {
  apisidebar: [
    {
      type: "doc",
      id: "vibeswitch-api",
    },
    {
      type: "category",
      label: "Auth",
      link: {
        type: "doc",
        id: "auth",
      },
      items: [
        {
          type: "doc",
          id: "discover-auth-requirements-for-this-deployment",
          label: "Discover auth requirements for this deployment.",
          className: "api-method get",
        },
      ],
    },
    {
      type: "category",
      label: "Reports",
      link: {
        type: "doc",
        id: "reports",
      },
      items: [
        {
          type: "doc",
          id: "fetch-todays-cached-report-if-any",
          label: "Fetch today's cached report (if any).",
          className: "api-method get",
        },
      ],
    },
    {
      type: "category",
      label: "Evidence",
      link: {
        type: "doc",
        id: "evidence",
      },
      items: [
        {
          type: "doc",
          id: "get-the-current-evidence-draft",
          label: "Get the current evidence draft.",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "update-the-current-evidence-draft",
          label: "Update the current evidence draft.",
          className: "api-method put",
        },
        {
          type: "doc",
          id: "submit-evidence-for-ingestion-analysis",
          label: "Submit evidence for ingestion/analysis.",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "list-recent-evidence-submissions",
          label: "List recent evidence submissions.",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "get-the-latest-submission-if-any",
          label: "Get the latest submission (if any).",
          className: "api-method get",
        },
        {
          type: "doc",
          id: "get-a-submission-by-id",
          label: "Get a submission by id.",
          className: "api-method get",
        },
      ],
    },
    {
      type: "category",
      label: "Analysis",
      link: {
        type: "doc",
        id: "analysis",
      },
      items: [
        {
          type: "doc",
          id: "run-analysis-server-sent-events",
          label: "Run analysis (Server-Sent Events).",
          className: "api-method post",
        },
      ],
    },
    {
      type: "category",
      label: "Video",
      link: {
        type: "doc",
        id: "video",
      },
      items: [
        {
          type: "doc",
          id: "download-a-video-from-a-url-and-return-its-local-path",
          label: "Download a video from a URL and return its local path.",
          className: "api-method post",
        },
        {
          type: "doc",
          id: "resolve-a-local-video-file-path",
          label: "Resolve a local video file path.",
          className: "api-method post",
        },
      ],
    },
    {
      type: "category",
      label: "Education",
      link: {
        type: "doc",
        id: "education",
      },
      items: [
        {
          type: "doc",
          id: "get-education-sessions-dashboard",
          label: "Get education sessions dashboard.",
          className: "api-method get",
        },
      ],
    },
    {
      type: "category",
      label: "Municipalities",
      link: {
        type: "doc",
        id: "municipalities",
      },
      items: [
        {
          type: "doc",
          id: "get-municipality-dashboard",
          label: "Get municipality dashboard.",
          className: "api-method get",
        },
      ],
    },
    {
      type: "category",
      label: "Naftali",
      link: {
        type: "doc",
        id: "naftali",
      },
      items: [
        {
          type: "doc",
          id: "get-naftali-dashboard",
          label: "Get Naftali dashboard.",
          className: "api-method get",
        },
      ],
    },
    {
      type: "category",
      label: "Translation",
      link: {
        type: "doc",
        id: "translation",
      },
      items: [
        {
          type: "doc",
          id: "translate-an-assessment-to-a-target-language-when-enabled",
          label: "Translate an assessment to a target language (when enabled).",
          className: "api-method post",
        },
      ],
    },
    {
      type: "category",
      label: "Chat",
      link: {
        type: "doc",
        id: "chat",
      },
      items: [
        {
          type: "doc",
          id: "chat-with-the-system-server-sent-events",
          label: "Chat with the system (Server-Sent Events).",
          className: "api-method post",
        },
      ],
    },
  ],
};

export default sidebar.apisidebar;
