"use client";
import type { ProductVariant } from "@/lib/product-variant";
import { Input } from "@/components/ui/input";
const initial: ProductVariant = {
  plan: "",
  access: "PERSONAL",
  fulfillment: "ACCOUNT",
  delivery: "AUTOMATIC",
  warranty: { kind: "NONE", days: 0, coverage: "NONE" },
  region: "GLOBAL",
  quota: "STANDARD",
};
export function VariantFields({
  value,
  onChange,
  fa,
}: {
  value: ProductVariant | null;
  onChange: (value: ProductVariant | null) => void;
  fa: boolean;
}) {
  const select = "h-11 w-full rounded-xl border border-border bg-card px-3 text-sm";
  const update = (patch: Partial<ProductVariant>) => onChange({ ...value!, ...patch });
  return (
    <div className="space-y-4 rounded-xl border border-border p-4">
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked ? { ...initial } : null)}
          className="accent-primary"
        />
        {fa ? "مشخصات مستقل تنوع محصول" : "Structured product configuration"}
      </label>
      {value && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            {fa ? "پلن دقیق (مثلاً PLUS یا PRO)" : "Exact plan (e.g. PLUS or PRO)"}
            <Input
              value={value.plan}
              onChange={(e) => update({ plan: e.target.value })}
              maxLength={100}
              required
            />
          </label>
          <label className="text-sm">
            {fa ? "نوع دسترسی" : "Access type"}
            <select
              className={select}
              value={value.access}
              onChange={(e) => update({ access: e.target.value as ProductVariant["access"] })}
            >
              <option value="PERSONAL">{fa ? "اختصاصی" : "Individual"}</option>
              <option value="SHARED">{fa ? "اشتراکی" : "Shared"}</option>
              <option value="TEAM">{fa ? "تیمی" : "Team"}</option>
            </select>
          </label>
          <label className="text-sm">
            {fa ? "نوع دریافت" : "Delivery type"}
            <select
              className={select}
              value={value.fulfillment}
              onChange={(e) =>
                update({ fulfillment: e.target.value as ProductVariant["fulfillment"] })
              }
            >
              <option value="ACCOUNT">{fa ? "اکانت آماده" : "Ready account"}</option>
              <option value="INVITE">{fa ? "اینوایتی" : "Invitation"}</option>
              <option value="CODE">{fa ? "کد فعال‌سازی" : "Redeem code"}</option>
              <option value="UPGRADE">{fa ? "فعال‌سازی روی حساب" : "Account upgrade"}</option>
            </select>
          </label>
          <label className="text-sm">
            {fa ? "شیوهٔ تحویل" : "Fulfillment"}
            <select
              className={select}
              value={value.delivery}
              onChange={(e) => update({ delivery: e.target.value as ProductVariant["delivery"] })}
            >
              <option value="AUTOMATIC">{fa ? "خودکار" : "Automatic"}</option>
              <option value="MANUAL">{fa ? "دستی" : "Manual"}</option>
            </select>
          </label>
          <label className="text-sm">
            {fa ? "ضمانت" : "Warranty"}
            <select
              className={select}
              value={value.warranty.kind}
              onChange={(e) =>
                update({
                  warranty:
                    e.target.value === "NONE"
                      ? { kind: "NONE", days: 0, coverage: "NONE" }
                      : { kind: "WARRANTED", days: 0, coverage: "LOGIN" },
                })
              }
            >
              <option value="NONE">
                {fa ? "بدون ضمانت (شامل نامشخص)" : "No warranty (includes unspecified)"}
              </option>
              <option value="WARRANTED">{fa ? "دارای ضمانت مشخص" : "Specified warranty"}</option>
            </select>
          </label>
          {value.warranty.kind === "WARRANTED" && (
            <>
              <label className="text-sm">
                {fa ? "مدت ضمانت — روز" : "Warranty duration — days"}
                <Input
                  type="number"
                  min={1}
                  max={3650}
                  value={value.warranty.days || ""}
                  onChange={(e) =>
                    update({ warranty: { ...value.warranty, days: Number(e.target.value) } })
                  }
                  required
                />
              </label>
              <label className="text-sm">
                {fa ? "پوشش ضمانت" : "Warranty coverage"}
                <select
                  className={select}
                  value={value.warranty.coverage}
                  onChange={(e) =>
                    update({
                      warranty: { ...value.warranty, coverage: e.target.value as "FULL" | "LOGIN" },
                    })
                  }
                >
                  <option value="LOGIN">{fa ? "مشکل ورود" : "Login problems"}</option>
                  <option value="FULL">{fa ? "پوشش کامل" : "Full coverage"}</option>
                </select>
              </label>
            </>
          )}
          <label className="text-sm">
            {fa ? "ریجن تأییدشده" : "Verified region"}
            <Input
              value={value.region}
              maxLength={60}
              onChange={(e) => update({ region: e.target.value })}
            />
          </label>
          <label className="text-sm">
            {fa ? "سهمیه / محدودیت دقیق" : "Exact quota / limits"}
            <Input
              value={value.quota}
              maxLength={100}
              onChange={(e) => update({ quota: e.target.value })}
            />
          </label>
        </div>
      )}
      <p className="text-xs leading-6 text-muted">
        {fa
          ? "مشخصات پلنی که موجودی یا سفارش دارد قابل تغییر نیست؛ برای شرایط جدید، پلن جدید بساز. ضمانت نامشخص بدون ضمانت محسوب می‌شود."
          : "Configurations with inventory or orders cannot change terms. Create a new plan instead. Unspecified warranty is treated as no warranty."}
      </p>
    </div>
  );
}
