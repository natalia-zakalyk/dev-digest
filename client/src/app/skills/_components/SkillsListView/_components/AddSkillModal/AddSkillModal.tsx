/* AddSkillModal — one modal with three ways to add a skill: Create (type it), From file (.md / .zip)
   and Import from URL (GitHub-hosted). A URL import does not save anything: it opens the standard
   create form pre-filled, flagged with a red banner when the injection gate fires.
   Spec: client/specs/skills.md */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal, Tabs } from "@devdigest/ui";
import { ADD_TABS, MODAL_WIDTH, type AddTab } from "./constants";
import { CreateTab, type Prefill } from "./_components/CreateTab";
import { FileTab } from "./_components/FileTab";
import { UrlTab } from "./_components/UrlTab";
import { s } from "./styles";

export function AddSkillModal({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const t = useTranslations("skills");
  const [tab, setTab] = React.useState<AddTab>("create");
  // Set by a successful URL import; remounts the Create tab with the fetched skill filled in.
  const [prefill, setPrefill] = React.useState<Prefill | undefined>();
  const [prefillKey, setPrefillKey] = React.useState(0);

  const tabs = ADD_TABS.map((key) => ({ key, label: t(`add.tabs.${key}`) }));

  return (
    <Modal width={MODAL_WIDTH} title={t("add.title")} onClose={onClose}>
      <div style={s.tabs}>
        <Tabs tabs={tabs} value={tab} onChange={(k) => setTab(k as AddTab)} pad="0" />
      </div>
      <div style={s.body}>
        {tab === "create" && <CreateTab key={prefillKey} prefill={prefill} onSaved={onSaved} />}
        {tab === "file" && <FileTab onSaved={onSaved} />}
        {tab === "url" && (
          <UrlTab
            onImported={(p) => {
              setPrefill(p);
              setPrefillKey((k) => k + 1);
              setTab("create");
            }}
          />
        )}
      </div>
    </Modal>
  );
}
