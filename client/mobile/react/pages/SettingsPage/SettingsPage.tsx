import { useState } from "react";
import { useTranslation } from "react-i18next";
import "../../styles/SettingsPage.css";
import { FixedSearchBar } from "./FixedSearchBar.js";
import { SettingsDetailPage } from "./SettingsDetailPage.js";
import { SettingsSidebar } from "./SettingsSidebar.js";

export function SettingsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("account");
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearchChange = (query) => {
    setSearchQuery(query);
  };

  return (
    <div className="settings-page-layout">
      <div className="settings-left-pane">
        <FixedSearchBar
          searchQuery={searchQuery}
          activeTab={activeTab}
          onSearchChange={handleSearchChange}
        />
        <SettingsSidebar
          activeTab={activeTab}
          onSelectTab={(tab) => {
            setActiveTab(tab);
            setSearchQuery("");
          }}
          t={t}
        />
      </div>

      <div className="settings-right-pane">
        <SettingsDetailPage
          activeTab={activeTab}
          searchQuery={searchQuery}
          t={t}
        />
      </div>
    </div>
  );
}
