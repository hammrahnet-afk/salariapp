import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { markAllRead } from '../lib/notify';
import { formatDate } from '../lib/jalali';
import { toFa } from '../lib/format';
import { Badge, Button, Card, EmptyState, Icon, SectionTitle, cx } from '../components/ui';

const KIND: Record<string, { icon: string; tone: 'brand' | 'warn' | 'danger' | 'info' | 'neutral' }> = {
  due: { icon: 'calendar', tone: 'warn' },
  overdue: { icon: 'alert', tone: 'danger' },
  stock: { icon: 'box', tone: 'info' },
  backup: { icon: 'database', tone: 'brand' },
  info: { icon: 'bell', tone: 'neutral' },
};

export default function Notifications() {
  const nav = useNavigate();
  const items = useLiveQuery(() => db.notifications.orderBy('createdAt').reverse().limit(200).toArray(), []) ?? [];
  const unread = items.filter((i) => !i.read).length;

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <Card>
        <SectionTitle icon="bell" title="اعلان‌ها" subtitle={`${toFa(unread)} خوانده‌نشده از ${toFa(items.length)}`}
          action={<Button size="sm" variant="outline" icon="check" onClick={() => markAllRead()}>خواندن همه</Button>} />
      </Card>

      <Card pad={false}>
        {!items.length ? <EmptyState icon="bell" title="اعلانی ندارید" hint="یادآوری سررسید اقساط و هشدار موجودی اینجا نمایش داده می‌شود." /> : (
          <div className="divide-y divide-line">
            {items.map((n) => {
              const k = KIND[n.kind] || KIND.info;
              return (
                <div key={n.id} className={cx('flex items-start gap-3 p-3 min-w-0', !n.read && 'bg-brand-soft/25')}
                  onClick={async () => { await db.notifications.update(n.id!, { read: 1 }); if (n.refId) nav(`/customers/${n.refId}`); }}>
                  <span className={cx('w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
                    k.tone === 'danger' ? 'bg-danger-soft text-danger' : k.tone === 'warn' ? 'bg-warn-soft text-warn' : k.tone === 'info' ? 'bg-info-soft text-info' : 'bg-surface2 text-muted')}>
                    <Icon name={k.icon} className="w-4 h-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium truncate">{n.title}</p>
                    <p className="text-[11px] text-muted leading-6">{n.body}</p>
                    <p className="text-[10px] text-muted mt-0.5">{formatDate(n.date)} • {new Date(n.createdAt).toLocaleTimeString('fa-IR')}</p>
                  </div>
                  {!n.read ? <span className="w-2 h-2 rounded-full bg-brand shrink-0 mt-2" /> : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
