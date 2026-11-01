"use client";
import type { ContentItem, Entitlement } from "@/components/member-types";
import { Empty, money, Top } from "@/components/member-ui";
import { t } from "@/lib/i18n";
import { rewardCost } from "@/lib/payment-presentation";

// Coin rewards from the catalog (content type "reward"); redeemed rewards become one-use QR rights.
export function RewardsScreen({ coinBalance, rewards, myRewards, busy, onBack, onRedeem, onOpenQr }: {
  coinBalance: number;
  rewards: ContentItem[];
  myRewards: Entitlement[];
  busy: boolean;
  onBack: () => void;
  onRedeem: (reward: ContentItem, cost: number) => void;
  onOpenQr: (right: Entitlement) => void;
}) {
  return (
    <div className="page">
      <Top title={t("แลกรางวัล")} icon="🪙" onBack={onBack} />
      <div className="coin-balance-card">
        <span>{t("Coin สะสมของฉัน")}</span>
        <strong>🪙 {money(coinBalance)}</strong>
      </div>
      {myRewards.length ? (
        <>
          <div className="reward-label">{t("รางวัลของฉัน (แสดง QR ให้เจ้าหน้าที่)")}</div>
          <div className="coin-reward-list">
            {myRewards.map((right) => (
              <button type="button" key={right.id} onClick={() => onOpenQr(right)}>
                <div><b>🎁 {t(right.title)}</b><small>{t("แตะเพื่อเปิด QR")}</small></div>
                <span>QR</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
      <div className="reward-label">{t("รางวัลที่แลกได้")}</div>
      <div className="coin-reward-list">
        {rewards.map((reward) => {
          const cost = rewardCost(reward.metadata) ?? 0;
          const short = coinBalance < cost;
          return (
            <button type="button" className={short ? "disabled" : ""} key={reward.id} disabled={busy || !cost} onClick={() => onRedeem(reward, cost)}>
              <div>
                <b>{reward.icon} {t(reward.title)}</b>
                <small>{short ? t("🪙 Coin ไม่พอ - ต้องการอีก {{value0}} เหรียญ", { value0: cost - coinBalance }) : t(reward.subtitle)}</small>
              </div>
              <span>🪙 {cost}</span>
            </button>
          );
        })}
      </div>
      {!rewards.length ? <Empty text={t("ยังไม่มีรางวัลให้แลก")} /> : null}
      <p className="reward-hint">{t("แตะรางวัลเพื่อรับ QR/โค้ดยื่นให้เจ้าหน้าที่หน้าคลับ")}</p>
    </div>
  );
}
