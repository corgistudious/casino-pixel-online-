import { Route, Routes } from 'react-router-dom';
import { AdminLayout, RequirePerm } from './AdminLayout';
import { AuditPage } from './AuditPage';
import { DashboardPage } from './DashboardPage';
import { DeletionsPage, SystemPage, UidsPage } from './MiscPages';
import { PlayersPage } from './PlayersPage';
import { VipAdminPage } from './VipAdminPage';
import { GiftsAdminPage } from './GiftsAdminPage';
import { CharmAdminPage } from './CharmAdminPage';
import { StaffPage } from './StaffPage';
import { ItemsPage } from './ItemsPage';
import { CollectionsAdminPage } from './CollectionsAdminPage';
import { MailAdminPage } from './MailAdminPage';
import { ProgressionAdminPage } from './ProgressionAdminPage';
import { SeasonRewardsPage } from './SeasonRewardsPage';
import { GiftcodesPage } from './GiftcodesPage';
import { SupportAdminPage } from './SupportAdminPage';
import { MissionConfigPage } from './MissionConfigPage';
import { RoomsAdminPage } from './RoomsAdminPage';
import { ReportsAdminPage } from './ReportsAdminPage';

/** Staff console routes: a separate chunk, so players never download the admin screens. */
export function AdminRoutes() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={null} />
        <Route path="dashboard" element={<RequirePerm perm="dashboard.read"><DashboardPage /></RequirePerm>} />
        <Route path="players" element={<RequirePerm perm="users.read"><PlayersPage /></RequirePerm>} />
        <Route path="players/:uid" element={<RequirePerm perm="users.read"><PlayersPage /></RequirePerm>} />
        <Route path="vip" element={<RequirePerm perm="vip.read"><VipAdminPage /></RequirePerm>} />
        <Route path="vip/:uid" element={<RequirePerm perm="vip.read"><VipAdminPage /></RequirePerm>} />
        <Route path="gifts" element={<RequirePerm perm="gifts.read"><GiftsAdminPage /></RequirePerm>} />
        <Route path="charm" element={<RequirePerm perm="charm.read"><CharmAdminPage /></RequirePerm>} />
        <Route path="charm/:uid" element={<RequirePerm perm="charm.read"><CharmAdminPage /></RequirePerm>} />
        <Route path="staff" element={<RequirePerm perm="staff.read"><StaffPage /></RequirePerm>} />
        <Route path="support" element={<RequirePerm perm="support.read"><SupportAdminPage /></RequirePerm>} />
        <Route path="reports" element={<RequirePerm perm="reports.manage"><ReportsAdminPage /></RequirePerm>} />
        <Route path="progression" element={<RequirePerm perm="progression.read"><ProgressionAdminPage /></RequirePerm>} />
        <Route path="missions" element={<RequirePerm perm="progression.read"><MissionConfigPage /></RequirePerm>} />
        <Route path="season-rewards" element={<RequirePerm perm="progression.read"><SeasonRewardsPage /></RequirePerm>} />
        <Route path="giftcodes" element={<RequirePerm perm="giftcode.manage"><GiftcodesPage /></RequirePerm>} />
        <Route path="rooms" element={<RequirePerm perm="rooms.manage"><RoomsAdminPage /></RequirePerm>} />
        <Route path="items" element={<RequirePerm perm="items.read"><ItemsPage /></RequirePerm>} />
        <Route path="collections" element={<RequirePerm perm="items.read"><CollectionsAdminPage /></RequirePerm>} />
        <Route path="mail" element={<RequirePerm perm="mail.send"><MailAdminPage /></RequirePerm>} />
        <Route path="audit" element={<RequirePerm perm="audit.read"><AuditPage /></RequirePerm>} />
        <Route path="uids" element={<RequirePerm perm="uid.assign"><UidsPage /></RequirePerm>} />
        <Route path="deletions" element={<RequirePerm perm="deletion.manage"><DeletionsPage /></RequirePerm>} />
        <Route path="system" element={<RequirePerm perm="mail.read"><SystemPage /></RequirePerm>} />
      </Route>
    </Routes>
  );
}
