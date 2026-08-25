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
  Image,
  FileText,
  Hash,
  Search,
  ExternalLink,
  Loader2,
  Upload,
  Save,
  Eye,
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
  const [customMediaUrlInput, setCustomMediaUrlInput] = useState("");
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
    setCustomMediaUrlInput("");
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (rule: PredefinedRule) => {
    setEditingRule({ ...rule });
    setTriggerCountInput(String(rule.trigger_count ?? (rule.trigger_type === "message_count" ? 3 : 1)));
    setKeywordInput(rule.keywords ? rule.keywords.join(", ") : "");
    setCustomMediaUrlInput("");
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

  const handleAddMediaUrl = () => {
    if (!customMediaUrlInput.trim() || !editingRule) return;
    const currentUrls = editingRule.media_urls || [];
    setEditingRule({
      ...editingRule,
      media_urls: [...currentUrls, customMediaUrlInput.trim()],
    });
    setCustomMediaUrlInput("");
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
        return <Image className="h-4 w-4 text-blue-500" />;
      case "document":
        return <FileText className="h-4 w-4 text-orange-500" />;
      case "audio":
      default:
        return <Volume2 className="h-4 w-4 text-emerald-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Predefined Automated Messages & Media
              </CardTitle>
              <CardDescription>
                Configure automated responses sent at specific conversation milestones (message count) or when customers ask for previews, demos, and testimonials.
              </CardDescription>
            </div>
            <div className="flex items-center justify-end gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={handleOpenAdd}>
                <Plus className="mr-2 h-4 w-4" />
                Add Predefined Rule
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Rules List */}
          {rules.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed rounded-lg border-muted p-8">
              <MessageSquare className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
              <h3 className="font-medium text-base mb-1">No Predefined Messages Configured</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
                Add automated messages to deliver sample audios, videos, and follow-ups after specific message milestones.
              </p>
              <Button onClick={handleOpenAdd} size="sm" variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                Add Predefined Rule
              </Button>
            </div>
          ) : (
            <div className="grid gap-4">
              {rules.map((rule) => {
                const mediaCount = (rule.media_urls || []).length;
                return (
                  <div
                    key={rule.id}
                    className={`border rounded-lg p-4 transition-all duration-200 ${
                      rule.enabled
                        ? "bg-card border-border shadow-sm hover:border-border"
                        : "bg-muted/30 border-dashed border-border opacity-70"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-semibold text-sm text-foreground">{rule.name}</h4>
                          <Badge
                            variant={rule.trigger_type === "message_count" ? "secondary" : "outline"}
                            className="text-xs gap-1 py-0.5"
                          >
                            {rule.trigger_type === "message_count" ? (
                              <>
                                <Hash className="h-3 w-3" />
                                After {rule.trigger_count || 1} Message{(rule.trigger_count || 1) > 1 ? "s" : ""}
                              </>
                            ) : (
                              <>
                                <Search className="h-3 w-3" />
                                Intent Keywords ({rule.keywords?.length || 0})
                              </>
                            )}
                          </Badge>

                          {rule.media_type && (
                            <Badge variant="outline" className="text-xs gap-1 py-0.5 capitalize">
                              {getMediaIcon(rule.media_type)}
                              {rule.media_type} {mediaCount > 0 && `(${mediaCount})`}
                            </Badge>
                          )}

                          {rule.once_per_contact && (
                            <Badge variant="outline" className="text-[10px] py-0 border-amber-500/40 text-amber-600 dark:text-amber-400">
                              Once Per Contact
                            </Badge>
                          )}
                        </div>

                        {rule.trigger_type !== "message_count" && rule.keywords && rule.keywords.length > 0 && (
                          <div className="flex flex-wrap gap-1 items-center pt-0.5">
                            <span className="text-[11px] text-muted-foreground font-medium">Triggers on:</span>
                            {rule.keywords.slice(0, 5).map((kw) => (
                              <span
                                key={kw}
                                className="text-[11px] bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground"
                              >
                                {kw}
                              </span>
                            ))}
                            {rule.keywords.length > 5 && (
                              <span className="text-[11px] text-muted-foreground">+{rule.keywords.length - 5} more</span>
                            )}
                          </div>
                        )}

                        <p className="text-xs text-muted-foreground line-clamp-2 pt-1 whitespace-pre-wrap font-sans">
                          {rule.message || "(No text message configured)"}
                        </p>

                        {mediaCount > 0 && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {rule.media_urls?.map((url, idx) => (
                              <a
                                key={idx}
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11px] text-primary flex items-center gap-1 hover:underline max-w-[260px] truncate"
                              >
                                <ExternalLink className="h-3 w-3 shrink-0" />
                                <span className="truncate">{url}</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 sm:self-center shrink-0 pt-2 sm:pt-0">
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
                          title="Preview message"
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
              <Button onClick={onSave} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Changes
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit / Create Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              {editingRule?.id.startsWith("rule-") && rules.some((r) => r.id === editingRule.id)
                ? "Edit Predefined Rule"
                : "Create Predefined Rule"}
            </DialogTitle>
            <DialogDescription>
              Set up the trigger conditions and the response message with optional media attachments.
            </DialogDescription>
          </DialogHeader>

          {editingRule && (
            <div className="space-y-4 py-2">
              {/* Name */}
              <div className="space-y-1.5">
                <Label htmlFor="rule-name">Rule Name</Label>
                <Input
                  id="rule-name"
                  placeholder="e.g., Free Preview Sample Audios"
                  value={editingRule.name}
                  onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })}
                />
              </div>

              {/* Trigger Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Trigger Condition</Label>
                  <Select
                    value={editingRule.trigger_type}
                    onValueChange={(val: any) => setEditingRule({ ...editingRule, trigger_type: val })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select trigger type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="message_count">
                        <div className="flex items-center gap-2">
                          <Hash className="h-4 w-4" />
                          Message Count Milestone
                        </div>
                      </SelectItem>
                      <SelectItem value="intent">
                        <div className="flex items-center gap-2">
                          <Search className="h-4 w-4" />
                          Keywords / Intent Match
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {editingRule.trigger_type === "message_count" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="trigger-count">Inbound Message Number</Label>
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
                      Triggers on customer message #{triggerCountInput || "1"}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="keywords">Matching Keywords (comma-separated)</Label>
                    <Input
                      id="keywords"
                      placeholder="sample, demo, preview, free audio"
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Triggers if the message contains any of these words
                    </p>
                  </div>
                )}
              </div>

              {/* Message Text */}
              <div className="space-y-1.5">
                <Label htmlFor="rule-message">Predefined WhatsApp Message</Label>
                <Textarea
                  id="rule-message"
                  rows={5}
                  placeholder="Write the message that will be sent to the customer..."
                  value={editingRule.message}
                  onChange={(e) => setEditingRule({ ...editingRule, message: e.target.value })}
                  className="font-sans text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  Emojis and links (Google Drive, PayHere) are fully supported.
                </p>
              </div>

              {/* Media Section */}
              <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-semibold">Media Attachment (Optional)</Label>
                  </div>
                  <Select
                    value={editingRule.media_type || "audio"}
                    onValueChange={(val: any) => setEditingRule({ ...editingRule, media_type: val })}
                  >
                    <SelectTrigger className="w-[140px] h-8 text-xs">
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

                {/* Upload or URL input */}
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Paste Google Drive / CDN link or media URL..."
                      value={customMediaUrlInput}
                      onChange={(e) => setCustomMediaUrlInput(e.target.value)}
                      className="text-xs h-9"
                    />
                    <Button type="button" size="sm" variant="secondary" onClick={handleAddMediaUrl} className="shrink-0 h-9">
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add URL
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer inline-flex items-center justify-center rounded-md text-xs font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 px-3 transition-colors">
                      {uploading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5 text-primary" />
                      ) : (
                        <Upload className="h-3.5 w-3.5 mr-1.5" />
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
                    <span className="text-[11px] text-muted-foreground">Supports MP3, MP4, PNG, JPG, PDF up to 50MB</span>
                  </div>
                </div>

                {/* Attached URLs list */}
                {(editingRule.media_urls || []).length > 0 && (
                  <div className="space-y-1.5 pt-2">
                    <span className="text-xs font-medium text-muted-foreground">Attached Media:</span>
                    <div className="space-y-1.5">
                      {editingRule.media_urls?.map((url, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between gap-2 p-2 rounded-md bg-background border text-xs"
                        >
                          <div className="flex items-center gap-2 truncate">
                            {getMediaIcon(editingRule.media_type)}
                            <span className="truncate font-mono text-[11px]">{url}</span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:bg-destructive/10"
                            onClick={() => handleRemoveMediaUrl(url)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Toggles */}
              <div className="flex flex-col sm:flex-row gap-4 pt-2 border-t">
                <div className="flex items-center justify-between sm:justify-start gap-3 flex-1">
                  <Switch
                    id="rule-enabled"
                    checked={editingRule.enabled}
                    onCheckedChange={(checked) => setEditingRule({ ...editingRule, enabled: checked })}
                  />
                  <Label htmlFor="rule-enabled" className="text-xs cursor-pointer">
                    Enable this rule
                  </Label>
                </div>

                <div className="flex items-center justify-between sm:justify-start gap-3 flex-1">
                  <Switch
                    id="once-per-contact"
                    checked={editingRule.once_per_contact || false}
                    onCheckedChange={(checked) => setEditingRule({ ...editingRule, once_per_contact: checked })}
                  />
                  <Label htmlFor="once-per-contact" className="text-xs cursor-pointer">
                    Send only once per student
                  </Label>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveModal}>
              Save Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Message Preview Modal */}
      <Dialog open={!!previewRule} onOpenChange={(open) => !open && setPreviewRule(null)}>
        <DialogContent className="max-w-md p-0 overflow-hidden bg-[#0b141a] border-[#222e35] text-white">
          <div className="bg-[#202c33] p-3 flex items-center gap-3 border-b border-[#222e35]">
            <div className="h-9 w-9 rounded-full bg-emerald-600 flex items-center justify-center font-bold text-white text-sm">
              FL
            </div>
            <div>
              <div className="font-semibold text-sm text-[#e9edef]">Flexlearn Support Bot</div>
              <div className="text-[11px] text-[#8696a0]">
                Preview: {previewRule?.name}
              </div>
            </div>
          </div>

          <div className="p-4 bg-[url('https://static.whatsapp.net/rsrc.php/v3/y6/r/wa669ae9z2j.png')] bg-repeat min-h-[220px] flex flex-col justify-end">
            <div className="bg-[#005c4b] text-[#e9edef] rounded-lg p-3 max-w-[90%] self-start shadow-md space-y-2 text-sm leading-relaxed">
              {previewRule?.media_urls && previewRule.media_urls.length > 0 && (
                <div className="bg-[#025142] p-2 rounded flex items-center gap-2 text-xs border border-[#007a65]">
                  {getMediaIcon(previewRule.media_type)}
                  <span className="truncate font-mono text-[11px]">{previewRule.media_urls[0]}</span>
                </div>
              )}
              <div className="whitespace-pre-wrap">{previewRule?.message}</div>
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
