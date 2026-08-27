import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { uploadMedia, deleteMedia } from "@/lib/mediaStorage";
import {
  MessageSquare,
  Plus,
  Trash2,
  Edit2,
  Volume2,
  Video,
  Image as ImageIcon,
  FileText,
  Hash,
  Search,
  Loader2,
  Upload,
  Save,
  Eye,
  Sparkles,
} from "lucide-react";

export interface PredefinedRule {
  id: string;
  name: string;
  trigger_type: "message_count" | "intent" | "keyword";
  trigger_count?: number;
  keywords?: string[];
  message: string;
  media_urls?: string[];
  media_url?: string;
  media_type?: "audio" | "video" | "image" | "document";
  enabled: boolean;
  once_per_contact?: boolean;
}

interface PredefinedMessagesManagerProps {
  rules: PredefinedRule[];
  onChange: (rules: PredefinedRule[]) => void;
  onSave: () => void;
  saving?: boolean;
}

interface MediaMeta {
  fileName: string;
  isDrive: boolean;
  type: "audio" | "video" | "image" | "document";
  extension: string;
}

function parseMediaUrl(url: string, defaultType?: string): MediaMeta {
  if (!url) {
    return { fileName: "Media", isDrive: false, type: (defaultType as any) || "audio", extension: "" };
  }

  let fileName = "";
  let isDrive = false;
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes("drive.google.com")) {
      isDrive = true;
      fileName = "Google Drive Preview Link";
    } else {
      const parts = urlObj.pathname.split("/").filter(Boolean);
      fileName = decodeURIComponent(parts[parts.length - 1] || "media-file");
    }
  } catch {
    fileName = url.split("/").pop() || "media-file";
  }

  const extMatch = fileName.match(/\.([a-zA-Z0-9]+)$/);
  const extension = extMatch ? extMatch[1].toLowerCase() : "";

  let type: "audio" | "video" | "image" | "document" = (defaultType as any) || "audio";
  if (["mp3", "wav", "ogg", "m4a", "aac", "opus", "weba"].includes(extension)) {
    type = "audio";
  } else if (["mp4", "webm", "mov", "mkv", "avi"].includes(extension)) {
    type = "video";
  } else if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(extension)) {
    type = "image";
  } else if (["pdf", "doc", "docx", "xls", "xlsx", "txt"].includes(extension) || isDrive) {
    type = "document";
  }

  return { fileName, isDrive, type, extension };
}

export default function PredefinedMessagesManager({
  rules,
  onChange,
  onSave,
  saving = false,
}: PredefinedMessagesManagerProps) {
  const { toast } = useToast();
  const [editingRule, setEditingRule] = useState<PredefinedRule | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [keywordInput, setKeywordInput] = useState("");
  const [triggerCountInput, setTriggerCountInput] = useState<string>("3");
  const [uploading, setUploading] = useState(false);
  const [previewRule, setPreviewRule] = useState<PredefinedRule | null>(null);

  const handleOpenAdd = () => {
    setEditingRule({
      id: `rule-${Date.now()}`,
      name: "",
      trigger_type: "message_count",
      trigger_count: 3,
      keywords: [],
      message: "",
      media_urls: [],
      media_type: "audio",
      enabled: true,
      once_per_contact: false,
    });
    setTriggerCountInput("3");
    setKeywordInput("");
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (rule: PredefinedRule) => {
    setEditingRule({ ...rule });
    setTriggerCountInput(String(rule.trigger_count ?? (rule.trigger_type === "message_count" ? 3 : 1)));
    setKeywordInput(rule.keywords ? rule.keywords.join(", ") : "");
    setIsDialogOpen(true);
  };

  const handleToggleRule = (ruleId: string, enabled: boolean) => {
    const updated = rules.map((r) => (r.id === ruleId ? { ...r, enabled } : r));
    onChange(updated);
  };

  const handleDeleteRule = (ruleId: string) => {
    const updated = rules.filter((r) => r.id !== ruleId);
    onChange(updated);
    toast({ title: "Rule removed" });
  };

  const handleSaveModal = () => {
    if (!editingRule) return;
    if (!editingRule.name.trim()) {
      toast({ title: "Rule name is required", variant: "destructive" });
      return;
    }

    const keywords = keywordInput
      .split(",")
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);

    const parsedCount = parseInt(triggerCountInput, 10);
    const validCount = isNaN(parsedCount) || parsedCount < 1 ? 1 : parsedCount;

    const finalizedRule: PredefinedRule = {
      ...editingRule,
      keywords,
      trigger_count: editingRule.trigger_type === "message_count" ? validCount : undefined,
    };

    const exists = rules.some((r) => r.id === finalizedRule.id);
    let updatedRules: PredefinedRule[];
    if (exists) {
      updatedRules = rules.map((r) => (r.id === finalizedRule.id ? finalizedRule : r));
    } else {
      updatedRules = [...rules, finalizedRule];
    }

    onChange(updatedRules);
    setIsDialogOpen(false);
    setEditingRule(null);
    toast({ title: exists ? "Rule updated" : "Predefined rule added" });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !editingRule) return;

    setUploading(true);
    try {
      const file = files[0];
      const url = await uploadMedia(file, "predefined");
      const currentUrls = editingRule.media_urls || [];
      setEditingRule({
        ...editingRule,
        media_urls: [...currentUrls, url],
      });
      toast({ title: "Media uploaded successfully" });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleRemoveMediaUrl = async (url: string) => {
    if (!editingRule) return;
    try {
      await deleteMedia(url);
    } catch (e) {
      /* ignore */
    }
    const currentUrls = editingRule.media_urls || [];
    setEditingRule({
      ...editingRule,
      media_urls: currentUrls.filter((u) => u !== url),
    });
  };

  const getMediaIcon = (type?: string) => {
    switch (type) {
      case "video":
        return <Video className="h-4 w-4 text-purple-500" />;
      case "image":
        return <ImageIcon className="h-4 w-4 text-blue-500" />;
      case "document":
        return <FileText className="h-4 w-4 text-amber-500" />;
      case "audio":
      default:
        return <Volume2 className="h-4 w-4 text-emerald-500" />;
    }
  };

  return (
    <div className="space-y-6 w-full min-w-0">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Predefined Automated Messages & Media
              </CardTitle>
              <CardDescription>
                Configure automated responses sent at specific conversation milestones (message count) or when customers ask for previews, demos, and testimonials
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenAdd}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Predefined Rule
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Rules List */}
          {rules.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed rounded-xl border-muted p-8">
              <MessageSquare className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
              <h3 className="font-medium text-base mb-1 text-foreground">No Predefined Messages Configured</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
                Add automated messages to deliver sample audios, videos, and follow-ups after specific message milestones.
              </p>
              <Button onClick={handleOpenAdd} size="sm" variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                Add Predefined Rule
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 w-full min-w-0">
              {rules.map((rule) => {
                const mediaCount = (rule.media_urls || []).length;
                return (
                  <div
                    key={rule.id}
                    className={`border rounded-xl p-4 sm:p-5 transition-all duration-200 w-full min-w-0 ${
                      rule.enabled
                        ? "bg-card border-border shadow-xs hover:shadow-md hover:border-primary/30"
                        : "bg-muted/30 border-dashed border-border opacity-70"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 min-w-0">
                      <div className="space-y-2.5 flex-1 min-w-0">
                        {/* Title & Badges */}
                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                          <h4 className="font-semibold text-sm sm:text-base text-foreground break-words">{rule.name}</h4>
                          <Badge
                            variant={rule.trigger_type === "message_count" ? "secondary" : "outline"}
                            className="text-xs gap-1.5 py-0.5"
                          >
                            {rule.trigger_type === "message_count" ? (
                              <>
                                <Hash className="h-3 w-3" />
                                After {rule.trigger_count || 1} Message{(rule.trigger_count || 1) > 1 ? "s" : ""}
                              </>
                            ) : (
                              <>
                                <Search className="h-3 w-3" />
                                Keywords ({rule.keywords?.length || 0})
                              </>
                            )}
                          </Badge>

                          {rule.media_type && (
                            <Badge variant="outline" className="text-xs gap-1.5 py-0.5 capitalize">
                              {getMediaIcon(rule.media_type)}
                              {rule.media_type} {mediaCount > 0 && `(${mediaCount})`}
                            </Badge>
                          )}

                          {rule.once_per_contact && (
                            <Badge variant="outline" className="text-[10px] py-0.5 border-amber-500/40 text-amber-600 dark:text-amber-400">
                              Once Per Contact
                            </Badge>
                          )}
                        </div>

                        {/* Keywords triggers */}
                        {rule.trigger_type !== "message_count" && rule.keywords && rule.keywords.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 items-center pt-0.5 min-w-0">
                            <span className="text-[11px] text-muted-foreground font-medium shrink-0">Triggers on:</span>
                            {rule.keywords.map((kw) => (
                              <span
                                key={kw}
                                className="text-[11px] bg-muted/80 px-2 py-0.5 rounded-md font-mono text-muted-foreground break-all"
                              >
                                {kw}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Message preview snippet */}
                        <div className="text-xs sm:text-sm text-foreground/90 bg-muted/30 p-3 rounded-lg border border-border/50 font-sans whitespace-pre-wrap break-words line-clamp-3">
                          {rule.message || <span className="text-muted-foreground italic">(No text message configured)</span>}
                        </div>

                        {/* Attached Media Chips */}
                        {mediaCount > 0 && (
                          <div className="space-y-1.5 pt-1 min-w-0">
                            <span className="text-[11px] font-medium text-muted-foreground">Attachments ({mediaCount}):</span>
                            <div className="flex flex-wrap gap-2 min-w-0">
                              {rule.media_urls?.map((url, idx) => {
                                const meta = parseMediaUrl(url, rule.media_type);
                                return (
                                  <div
                                    key={idx}
                                    className="inline-flex items-center gap-1.5 text-[11px] bg-background border border-border/80 px-2.5 py-1 rounded-md max-w-full truncate"
                                  >
                                    <span className="shrink-0">{getMediaIcon(meta.type)}</span>
                                    <span className="font-medium text-foreground truncate max-w-[220px]">{meta.fileName}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Actions Toolbar */}
                      <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 border-t sm:border-t-0 pt-3 sm:pt-0 sm:self-center">
                        <div className="flex items-center gap-2 mr-2">
                          <Switch
                            checked={rule.enabled}
                            onCheckedChange={(checked) => handleToggleRule(rule.id, checked)}
                          />
                          <span className="text-xs font-medium text-muted-foreground">
                            {rule.enabled ? "Active" : "Disabled"}
                          </span>
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => setPreviewRule(rule)}
                          title="Preview WhatsApp message"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => handleOpenEdit(rule)}
                          title="Edit rule"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteRule(rule.id)}
                          title="Delete rule"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {rules.length > 0 && (
            <div className="flex justify-end pt-2">
              <Button onClick={onSave} disabled={saving} className="shadow-sm">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Changes
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit / Create Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="w-[95vw] sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden border-border shadow-2xl">
          <DialogHeader className="px-6 py-5 border-b border-border/80 bg-muted/10 shrink-0">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-lg font-semibold text-foreground">
                  {editingRule?.id.startsWith("rule-") && rules.some((r) => r.id === editingRule.id)
                    ? "Edit Predefined Rule"
                    : "Create Predefined Rule"}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Set up trigger conditions, automated response copy, and multimedia attachments.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {editingRule && (
            <div className="overflow-y-auto px-6 py-5 space-y-5 flex-1 min-w-0">
              {/* Name */}
              <div className="space-y-1.5 min-w-0">
                <Label htmlFor="rule-name" className="text-xs font-semibold text-foreground">
                  Rule Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="rule-name"
                  placeholder="e.g., Free Preview Sample Audios"
                  value={editingRule.name}
                  onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })}
                  className="font-medium"
                />
              </div>

              {/* Trigger Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
                <div className="space-y-1.5 min-w-0">
                  <Label className="text-xs font-semibold text-foreground">Trigger Condition</Label>
                  <Select
                    value={editingRule.trigger_type}
                    onValueChange={(val: any) => setEditingRule({ ...editingRule, trigger_type: val })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select trigger type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="message_count">
                        <div className="flex items-center gap-2">
                          <Hash className="h-4 w-4 text-muted-foreground" />
                          <span>Message Count Milestone</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="intent">
                        <div className="flex items-center gap-2">
                          <Search className="h-4 w-4 text-muted-foreground" />
                          <span>Keywords / Intent Match</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {editingRule.trigger_type === "message_count" ? (
                  <div className="space-y-1.5 min-w-0">
                    <Label htmlFor="trigger-count" className="text-xs font-semibold text-foreground">
                      Inbound Message Number
                    </Label>
                    <Input
                      id="trigger-count"
                      type="number"
                      min={1}
                      max={100}
                      value={triggerCountInput}
                      onChange={(e) => {
                        setTriggerCountInput(e.target.value);
                        const parsed = parseInt(e.target.value, 10);
                        setEditingRule({ ...editingRule, trigger_count: isNaN(parsed) ? 1 : parsed });
                      }}
                      placeholder="e.g. 3"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Triggers on student message #{triggerCountInput || "1"}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5 min-w-0">
                    <Label htmlFor="keywords" className="text-xs font-semibold text-foreground">
                      Matching Keywords (comma-separated)
                    </Label>
                    <Input
                      id="keywords"
                      placeholder="sample, demo, preview, free audio"
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Triggers if student's message contains any of these words
                    </p>
                  </div>
                )}
              </div>

              {/* Message Text */}
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center justify-between">
                  <Label htmlFor="rule-message" className="text-xs font-semibold text-foreground">
                    Predefined WhatsApp Message
                  </Label>
                  <span className="text-[11px] text-muted-foreground">
                    {editingRule.message?.length || 0} characters
                  </span>
                </div>
                <Textarea
                  id="rule-message"
                  rows={5}
                  placeholder="Write the message that will be sent to the customer..."
                  value={editingRule.message}
                  onChange={(e) => setEditingRule({ ...editingRule, message: e.target.value })}
                  className="font-sans text-sm resize-y min-h-[110px]"
                />
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-primary shrink-0" />
                  Emojis and text formatting are fully supported.
                </p>
              </div>

              {/* Media Section */}
              <div className="border rounded-xl p-4 sm:p-5 bg-muted/20 space-y-4 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                      Media Attachment (Optional)
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Attach audio recordings, preview videos, images, or documents.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">Type:</span>
                    <Select
                      value={editingRule.media_type || "audio"}
                      onValueChange={(val: any) => setEditingRule({ ...editingRule, media_type: val })}
                    >
                      <SelectTrigger className="w-[145px] h-8 text-xs bg-background">
                        <SelectValue placeholder="Media Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="audio">🎵 Audio File</SelectItem>
                        <SelectItem value="video">🎥 Video</SelectItem>
                        <SelectItem value="image">🖼️ Image</SelectItem>
                        <SelectItem value="document">📄 Document / PDF</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Upload media file only */}
                <div className="space-y-3 min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="cursor-pointer inline-flex items-center justify-center rounded-lg text-xs font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3.5 transition-colors shadow-xs">
                      {uploading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-2 text-primary" />
                      ) : (
                        <Upload className="h-3.5 w-3.5 mr-2 text-primary" />
                      )}
                      Upload Media File
                      <input
                        type="file"
                        accept="audio/*,video/*,image/*,.pdf"
                        onChange={handleFileUpload}
                        disabled={uploading}
                        className="hidden"
                      />
                    </label>
                    <span className="text-[11px] text-muted-foreground">
                      Supports MP3, WAV, MP4, PNG, JPG, PDF up to 50MB
                    </span>
                  </div>
                </div>

                {/* Attached files list */}
                {(editingRule.media_urls || []).length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-border/60 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">
                        Attached Files ({editingRule.media_urls?.length}):
                      </span>
                    </div>

                    <div className="space-y-2 min-w-0">
                      {editingRule.media_urls?.map((url, i) => {
                        const meta = parseMediaUrl(url, editingRule.media_type);
                        return (
                          <div
                            key={i}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-background border border-border/80 shadow-xs hover:border-primary/40 transition-all min-w-0"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div
                                className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                                  meta.type === "audio"
                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                    : meta.type === "video"
                                    ? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                                    : meta.type === "image"
                                    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                }`}
                              >
                                {getMediaIcon(meta.type)}
                              </div>

                              <div className="min-w-0 flex-1 space-y-0.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-semibold text-foreground truncate max-w-[320px]">
                                    {meta.fileName}
                                  </span>
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 uppercase font-mono">
                                    #{i + 1} {meta.extension || meta.type}
                                  </Badge>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                              {meta.type === "audio" && (
                                <audio
                                  controls
                                  src={url}
                                  preload="none"
                                  className="h-7 w-36 sm:w-48 rounded"
                                />
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                onClick={() => handleRemoveMediaUrl(url)}
                                title="Remove attachment"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Toggles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t min-w-0">
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/60">
                  <div className="space-y-0.5">
                    <Label htmlFor="rule-enabled" className="text-xs font-semibold cursor-pointer">
                      Rule Status
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      Enable or disable automated dispatch
                    </p>
                  </div>
                  <Switch
                    id="rule-enabled"
                    checked={editingRule.enabled}
                    onCheckedChange={(checked) => setEditingRule({ ...editingRule, enabled: checked })}
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border border-border/60">
                  <div className="space-y-0.5">
                    <Label htmlFor="once-per-contact" className="text-xs font-semibold cursor-pointer">
                      Once Per Contact
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      Send only once per student phone number
                    </p>
                  </div>
                  <Switch
                    id="once-per-contact"
                    checked={editingRule.once_per_contact || false}
                    onCheckedChange={(checked) => setEditingRule({ ...editingRule, once_per_contact: checked })}
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="px-6 py-4 border-t border-border/80 bg-muted/10 shrink-0 flex items-center justify-between sm:justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveModal}>
              Save Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Message Preview Modal */}
      <Dialog open={!!previewRule} onOpenChange={(open) => !open && setPreviewRule(null)}>
        <DialogContent className="max-w-md p-0 overflow-hidden bg-[#0b141a] border-[#222e35] text-white">
          <div className="bg-[#202c33] p-3.5 flex items-center gap-3 border-b border-[#222e35]">
            <div className="h-9 w-9 rounded-full bg-emerald-600 flex items-center justify-center font-bold text-white text-sm shrink-0">
              BS
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm text-[#e9edef] truncate">BuildStart Support Bot</div>
              <div className="text-[11px] text-[#8696a0] truncate">
                Rule: {previewRule?.name}
              </div>
            </div>
          </div>

          <div className="p-4 bg-[url('https://static.whatsapp.net/rsrc.php/v3/y6/r/wa669ae9z2j.png')] bg-repeat min-h-[240px] max-h-[60vh] overflow-y-auto flex flex-col justify-end">
            <div className="bg-[#005c4b] text-[#e9edef] rounded-lg p-3 max-w-[92%] self-start shadow-md space-y-2 text-sm leading-relaxed min-w-0">
              {previewRule?.media_urls && previewRule.media_urls.length > 0 && (
                <div className="space-y-1.5 min-w-0">
                  {previewRule.media_urls.map((url, i) => {
                    const meta = parseMediaUrl(url, previewRule.media_type);
                    return (
                      <div key={i} className="bg-[#025142] p-2 rounded flex flex-col gap-1.5 text-xs border border-[#007a65] min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="shrink-0">{getMediaIcon(meta.type)}</span>
                          <span className="truncate font-mono text-[11px] flex-1">{meta.fileName}</span>
                        </div>
                        {meta.type === "audio" && (
                          <audio controls src={url} preload="none" className="h-6 w-full rounded" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="whitespace-pre-wrap break-words font-sans text-[13px]">{previewRule?.message}</div>
              <div className="text-[10px] text-[#8696a0] text-right pt-1">10:30 AM ✓✓</div>
            </div>
          </div>

          <div className="p-3 bg-[#202c33] flex justify-end">
            <Button size="sm" variant="secondary" onClick={() => setPreviewRule(null)}>
              Close Preview
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
