import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useStaffAccess } from "@/hooks/useStaffAccess";
import {
  CalendarClock,
  Plus,
  Clock,
  Users,
  ShieldCheck,
  Play,
  Pause,
  XCircle,
  Eye,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Send,
  Loader2,
  Shuffle,
  Info
} from "lucide-react";
import { format, addDays, parseISO, isAfter, isBefore } from "date-fns";
import { useSearchParams } from "react-router-dom";

interface ScheduledCampaign {
  id: string;
  title: string;
  message_template: string;
  target_filter: any;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  status: string;
  start_date: string;
  end_date: string;
  daily_start_time: string;
  daily_end_time: string;
  created_at: string;
}

interface ScheduledMessage {
  id: string;
  campaign_id: string;
  customer_name: string;
  phone_number: string;
  message: string;
  scheduled_at: string;
  sent_at: string | null;
  status: string;
  error_message: string | null;
}

interface CustomerRecipient {
  phone: string;
  name: string;
  district: string | null;
  product: string | null;
}

export default function Schedule() {
  const { user } = useAuth();
  const { effectiveUserId } = useStaffAccess();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  const [campaigns, setCampaigns] = useState<ScheduledCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<ScheduledCampaign | null>(null);
  const [campaignMessages, setCampaignMessages] = useState<ScheduledMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  // Campaign Form State
  const [title, setTitle] = useState("");
  const [messageTemplate, setMessageTemplate] = useState(
    "Hello {name}! 🎧 Here is your weekly Flexlearn audio module update for the {product}. Let us know how your progress is going! 🚀"
  );
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dailyStartTime, setDailyStartTime] = useState("09:00");
  const [dailyEndTime, setDailyEndTime] = useState("17:00");
  
  // Available & Selected Customers
  const [availableCustomers, setAvailableCustomers] = useState<CustomerRecipient[]>([]);
  const [selectedPhones, setSelectedPhones] = useState<Set<string>>(new Set());
  const [savingCampaign, setSavingCampaign] = useState(false);

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const ownerId = effectiveUserId || user?.id;
      if (!ownerId) return;

      const { data, error } = await supabase
        .from("scheduled_campaigns")
        .select("*")
        .eq("user_id", ownerId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCampaigns((data as any) || []);
    } catch (err: any) {
      console.error("Error fetching campaigns:", err);
      toast({
        title: "Error loading campaigns",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomersForSelection = async () => {
    try {
      const ownerId = effectiveUserId || user?.id;
      if (!ownerId) return;

      const { data: ordersData, error } = await supabase
        .from("orders")
        .select("customer_name, customer_phone, whatsapp_phone, district, order_items")
        .eq("user_id", ownerId);

      if (error) throw error;

      const map = new Map<string, CustomerRecipient>();
      for (const ord of ordersData || []) {
        const ph = (ord.whatsapp_phone || ord.customer_phone || "").replace(/\D/g, "");
        if (!ph) continue;

        let prodName = "90-Day SME Growth Challenge";
        if (Array.isArray(ord.order_items) && ord.order_items[0]?.name) {
          prodName = ord.order_items[0].name;
        }

        if (!map.has(ph)) {
          map.set(ph, {
            phone: ph,
            name: ord.customer_name || "Valued Student",
            district: ord.district || null,
            product: prodName,
          });
        }
      }

      const list = Array.from(map.values());
      setAvailableCustomers(list);

      // Check if specific phone is passed in URL query param
      const targetPhone = searchParams.get("phone");
      if (targetPhone && map.has(targetPhone.replace(/\D/g, ""))) {
        setSelectedPhones(new Set([targetPhone.replace(/\D/g, "")]));
        setShowCreateModal(true);
      } else {
        // Default select all paying customers
        setSelectedPhones(new Set(list.map((c) => c.phone)));
      }
    } catch (err) {
      console.error("Error loading customers for selection:", err);
    }
  };

  useEffect(() => {
    fetchCampaigns();
    fetchCustomersForSelection();
  }, [user, effectiveUserId]);

  const viewCampaignMessages = async (campaign: ScheduledCampaign) => {
    setSelectedCampaign(campaign);
    try {
      setMessagesLoading(true);
      const { data, error } = await supabase
        .from("scheduled_messages")
        .select("*")
        .eq("campaign_id", campaign.id)
        .order("scheduled_at", { ascending: true });

      if (error) throw error;
      setCampaignMessages((data as any) || []);
    } catch (err: any) {
      toast({
        title: "Error fetching campaign messages",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setMessagesLoading(false);
    }
  };

  const toggleCampaignStatus = async (campaign: ScheduledCampaign, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("scheduled_campaigns")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", campaign.id);

      if (error) throw error;
      toast({ title: `Campaign status updated to ${newStatus}` });
      fetchCampaigns();
      if (selectedCampaign?.id === campaign.id) {
        setSelectedCampaign({ ...selectedCampaign, status: newStatus });
      }
    } catch (err: any) {
      toast({
        title: "Update failed",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const deleteCampaign = async (id: string) => {
    if (!confirm("Are you sure you want to delete this scheduled campaign?")) return;
    try {
      const { error } = await supabase.from("scheduled_campaigns").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Campaign deleted" });
      if (selectedCampaign?.id === id) setSelectedCampaign(null);
      fetchCampaigns();
    } catch (err: any) {
      toast({
        title: "Delete failed",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  // Toggle single customer selection
  const togglePhoneSelect = (phone: string) => {
    setSelectedPhones((prev) => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone);
      else next.add(phone);
      return next;
    });
  };

  const selectAllCustomers = () => {
    setSelectedPhones(new Set(availableCustomers.map((c) => c.phone)));
  };

  const clearAllCustomers = () => {
    setSelectedPhones(new Set());
  };

  // Anti-Spam Jitter Distribution Algorithm
  const calculatedSchedule = useMemo(() => {
    const selectedList = availableCustomers.filter((c) => selectedPhones.has(c.phone));
    const count = selectedList.length;
    if (count === 0) return { items: [], avgIntervalMinutes: 0, daysCount: 1 };

    // Calculate dates between start and end
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = Math.max(0, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))) + 1;

    const [startH, startM] = dailyStartTime.split(":").map(Number);
    const [endH, endM] = dailyEndTime.split(":").map(Number);
    const startTotalMinutes = (startH || 9) * 60 + (startM || 0);
    const endTotalMinutes = (endH || 17) * 60 + (endM || 0);
    const dailySpanMinutes = Math.max(15, endTotalMinutes - startTotalMinutes);

    // Shuffle recipients to avoid predictable sequence
    const shuffled = [...selectedList].sort(() => Math.random() - 0.5);

    const customersPerDay = Math.ceil(count / daysDiff);
    const slotDurationMinutes = Math.max(0.5, dailySpanMinutes / customersPerDay);
    const avgInterval = Math.round((dailySpanMinutes * daysDiff) / count * 10) / 10;

    const scheduledItems: Array<{
      customer: CustomerRecipient;
      scheduledAt: Date;
      personalizedMessage: string;
    }> = [];

    let customerIdx = 0;
    for (let d = 0; d < daysDiff; d++) {
      const currentDay = addDays(start, d);
      const dayCount = Math.min(customersPerDay, count - customerIdx);

      for (let slot = 0; slot < dayCount; slot++) {
        if (customerIdx >= count) break;
        const cust = shuffled[customerIdx];

        // Slot boundary
        const slotStartMinute = startTotalMinutes + slot * slotDurationMinutes;
        // Add random jitter within slot: 10% to 90%
        const jitterFraction = 0.1 + Math.random() * 0.8;
        const sendMinute = slotStartMinute + slotDurationMinutes * jitterFraction;

        const sendH = Math.floor(sendMinute / 60);
        const sendM = Math.floor(sendMinute % 60);
        const sendS = Math.floor((sendMinute % 1) * 60);

        const scheduledDate = new Date(currentDay);
        scheduledDate.setHours(sendH, sendM, sendS, 0);

        // Personalize message
        const personalized = messageTemplate
          .replace(/{name}/g, cust.name)
          .replace(/{product}/g, cust.product || "90-Day SME Challenge")
          .replace(/{district}/g, cust.district || "your region");

        scheduledItems.push({
          customer: cust,
          scheduledAt: scheduledDate,
          personalizedMessage: personalized,
        });

        customerIdx++;
      }
    }

    // Sort chronologically
    scheduledItems.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

    return {
      items: scheduledItems,
      avgIntervalMinutes: avgInterval,
      daysCount: daysDiff,
    };
  }, [availableCustomers, selectedPhones, startDate, endDate, dailyStartTime, dailyEndTime, messageTemplate]);

  // Create Campaign & Insert Scheduled Messages
  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast({ title: "Please enter a campaign title", variant: "destructive" });
      return;
    }
    if (selectedPhones.size === 0) {
      toast({ title: "Please select at least 1 customer recipient", variant: "destructive" });
      return;
    }

    const ownerId = effectiveUserId || user?.id;
    if (!ownerId) return;

    setSavingCampaign(true);
    try {
      // 1. Create scheduled_campaigns row
      const { data: campaignData, error: campError } = await supabase
        .from("scheduled_campaigns")
        .insert({
          user_id: ownerId,
          title: title.trim(),
          message_template: messageTemplate,
          target_filter: { selected_count: selectedPhones.size },
          total_recipients: calculatedSchedule.items.length,
          sent_count: 0,
          failed_count: 0,
          status: "scheduled",
          start_date: startDate,
          end_date: endDate,
          daily_start_time: dailyStartTime,
          daily_end_time: dailyEndTime,
        })
        .select()
        .single();

      if (campError) throw campError;

      // 2. Batch insert individual scheduled_messages
      const messageRows = calculatedSchedule.items.map((item) => ({
        campaign_id: campaignData.id,
        user_id: ownerId,
        customer_name: item.customer.name,
        phone_number: item.customer.phone,
        message: item.personalizedMessage,
        scheduled_at: item.scheduledAt.toISOString(),
        status: "pending",
      }));

      const { error: msgInsertError } = await supabase
        .from("scheduled_messages")
        .insert(messageRows);

      if (msgInsertError) throw msgInsertError;

      toast({
        title: "Campaign Scheduled Successfully! 🚀",
        description: `${messageRows.length} messages scheduled with anti-spam random jitter intervals.`,
      });

      setShowCreateModal(false);
      setTitle("");
      fetchCampaigns();
    } catch (err: any) {
      console.error("Error creating campaign:", err);
      toast({
        title: "Failed to schedule broadcast",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSavingCampaign(false);
    }
  };

  // Metrics summary
  const totalCampaignsCount = campaigns.length;
  const activeCampaignsCount = campaigns.filter((c) => ["scheduled", "running"].includes(c.status)).length;
  const totalMessagesSent = campaigns.reduce((sum, c) => sum + (c.sent_count || 0), 0);
  const totalRecipientsAll = campaigns.reduce((sum, c) => sum + (c.total_recipients || 0), 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Schedule</h1>
            <p className="text-muted-foreground text-sm">
              Automated message scheduling with anti-spam random time dispersion
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setShowCreateModal(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Create Scheduled Broadcast
            </Button>
          </div>
        </div>

        {/* Campaigns List */}
        <Card>
          <CardHeader>
            <CardTitle>Broadcast Campaigns</CardTitle>
            <CardDescription>
              {campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""} configured
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Date Range</TableHead>
                  <TableHead>Daily Window</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      Loading broadcast campaigns...
                    </TableCell>
                  </TableRow>
                ) : campaigns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      <CalendarClock className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                      <p className="text-base font-medium">No scheduled broadcasts yet</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Schedule audio reminders, follow-ups, or announcements with automated anti-spam protection.
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-4"
                        onClick={() => setShowCreateModal(true)}
                      >
                        <Plus className="h-4 w-4 mr-1.5" />
                        Create First Broadcast
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  campaigns.map((camp) => {
                    const percent =
                      camp.total_recipients > 0
                        ? Math.round((camp.sent_count / camp.total_recipients) * 100)
                        : 0;

                    return (
                      <TableRow key={camp.id} className="hover:bg-muted/40 transition-colors">
                        <TableCell>
                          <div className="font-semibold text-foreground">{camp.title}</div>
                          <div className="text-xs text-muted-foreground line-clamp-1 max-w-sm mt-0.5">
                            {camp.message_template}
                          </div>
                        </TableCell>

                        <TableCell>
                          <Badge
                            variant={
                              camp.status === "completed"
                                ? "default"
                                : camp.status === "running"
                                ? "secondary"
                                : camp.status === "paused"
                                ? "outline"
                                : "outline"
                            }
                            className={
                              camp.status === "completed"
                                ? "bg-green-100 text-green-800 border-0"
                                : camp.status === "running"
                                ? "bg-blue-100 text-blue-800 border-0 animate-pulse"
                                : camp.status === "paused"
                                ? "bg-yellow-100 text-yellow-800 border-0"
                                : ""
                            }
                          >
                            {camp.status.toUpperCase()}
                          </Badge>
                        </TableCell>

                        <TableCell className="w-[180px]">
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs font-medium">
                              <span>{camp.sent_count} / {camp.total_recipients}</span>
                              <span>{percent}%</span>
                            </div>
                            <Progress value={percent} className="h-2" />
                            {camp.failed_count > 0 && (
                              <span className="text-[11px] text-destructive font-medium block">
                                {camp.failed_count} failed
                              </span>
                            )}
                          </div>
                        </TableCell>

                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {camp.start_date === camp.end_date ? (
                            <span>{camp.start_date}</span>
                          ) : (
                            <span>{camp.start_date} to {camp.end_date}</span>
                          )}
                        </TableCell>

                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap font-mono">
                          {camp.daily_start_time} - {camp.daily_end_time}
                        </TableCell>

                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-primary hover:bg-primary/10"
                              title="View message schedule breakdown"
                              onClick={() => viewCampaignMessages(camp)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>

                            {camp.status === "scheduled" || camp.status === "running" ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-yellow-600 hover:bg-yellow-50"
                                title="Pause Campaign"
                                onClick={() => toggleCampaignStatus(camp, "paused")}
                              >
                                <Pause className="h-4 w-4" />
                              </Button>
                            ) : camp.status === "paused" ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-green-600 hover:bg-green-50"
                                title="Resume Campaign"
                                onClick={() => toggleCampaignStatus(camp, "scheduled")}
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                            ) : null}

                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                              title="Delete Campaign"
                              onClick={() => deleteCampaign(camp.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Create Campaign Modal */}
        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
            <form onSubmit={handleCreateCampaign}>
              <DialogHeader>
                <DialogTitle className="text-xl flex items-center gap-2">
                  <CalendarClock className="h-5 w-5 text-primary" />
                  Create Scheduled WhatsApp Broadcast
                </DialogTitle>
                <DialogDescription>
                  Configure message content, recipient audience, and randomized anti-spam delivery slots.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-4">
                {/* 1. Campaign Title & Message */}
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="camp-title">Campaign Title *</Label>
                    <Input
                      id="camp-title"
                      placeholder="e.g. 90-Day SME Challenge — Weekly Reflection & Audio 12"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="camp-msg">Message Template *</Label>
                      <div className="flex gap-1.5">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-6 text-[11px] px-2"
                          onClick={() => setMessageTemplate((prev) => prev + " {name}")}
                        >
                          + {"{name}"}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-6 text-[11px] px-2"
                          onClick={() => setMessageTemplate((prev) => prev + " {product}")}
                        >
                          + {"{product}"}
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      id="camp-msg"
                      rows={4}
                      value={messageTemplate}
                      onChange={(e) => setMessageTemplate(e.target.value)}
                      placeholder="Write your WhatsApp message here. Use {name} for student name..."
                      required
                    />
                  </div>

                  {/* Live WhatsApp Preview */}
                  <div className="p-3 bg-muted/40 rounded-md border text-sm">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">
                      Preview WhatsApp Message Bubble
                    </span>
                    <div className="bg-[#e7fedb] dark:bg-[#005c4b]/30 p-3 rounded-lg border text-foreground text-sm max-w-lg shadow-sm whitespace-pre-wrap">
                      {messageTemplate
                        .replace(/{name}/g, "Kasun Perera")
                        .replace(/{product}/g, "90-Day SME Challenge")
                        .replace(/{district}/g, "Colombo")}
                    </div>
                  </div>
                </div>

                {/* 2. Customer Selection */}
                <div className="space-y-3 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base font-semibold">Target Paying Customers</Label>
                      <p className="text-xs text-muted-foreground">
                        Select students who will receive this broadcast ({selectedPhones.size} selected of {availableCustomers.length}).
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={selectAllCustomers}>
                        Select All
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={clearAllCustomers}>
                        Clear
                      </Button>
                    </div>
                  </div>

                  <div className="border rounded-md max-h-44 overflow-y-auto divide-y">
                    {availableCustomers.length === 0 ? (
                      <div className="p-4 text-center text-xs text-muted-foreground">
                        No customer records available. Add customers in the Customers tab first.
                      </div>
                    ) : (
                      availableCustomers.map((cust) => (
                        <div
                          key={cust.phone}
                          onClick={() => togglePhoneSelect(cust.phone)}
                          className="flex items-center justify-between p-2.5 hover:bg-muted/50 cursor-pointer text-sm"
                        >
                          <div className="flex items-center gap-2.5">
                            <Checkbox checked={selectedPhones.has(cust.phone)} />
                            <div>
                              <span className="font-medium text-foreground">{cust.name}</span>
                              <span className="text-xs text-muted-foreground ml-2 font-mono">{cust.phone}</span>
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                            {cust.product || cust.district || "Enrolled"}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 3. Schedule & Anti-Spam Distribution */}
                <div className="space-y-4 border-t pt-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-emerald-600" />
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">Anti-Spam Time Slot & Jitter Engine</h4>
                      <p className="text-xs text-muted-foreground">
                        Messages will be dynamically partitioned across your time range with randomized jitter.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="start-date">Start Date</Label>
                      <Input
                        id="start-date"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="end-date">End Date</Label>
                      <Input
                        id="end-date"
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="daily-start">Daily Start Time</Label>
                      <Input
                        id="daily-start"
                        type="time"
                        value={dailyStartTime}
                        onChange={(e) => setDailyStartTime(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="daily-end">Daily End Time</Label>
                      <Input
                        id="daily-end"
                        type="time"
                        value={dailyEndTime}
                        onChange={(e) => setDailyEndTime(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  {/* Calculated Anti-Spam Metric Banner */}
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-md text-emerald-900 dark:text-emerald-300 text-xs space-y-1">
                    <div className="font-semibold flex items-center gap-1.5">
                      <Shuffle className="h-3.5 w-3.5" />
                      Anti-Spam Dispersion Summary:
                    </div>
                    <p>
                      <strong>{selectedPhones.size}</strong> messages will be sent across{" "}
                      <strong>{calculatedSchedule.daysCount}</strong> day(s) between{" "}
                      <strong>{dailyStartTime}</strong> and <strong>{dailyEndTime}</strong>.
                    </p>
                    <p className="text-[11px] opacity-90">
                      ⚡ Average interval: <strong>~{calculatedSchedule.avgIntervalMinutes} minutes</strong> between each message with randomized jitter to prevent WhatsApp spam flags.
                    </p>
                  </div>

                  {/* Live Schedule Preview */}
                  {calculatedSchedule.items.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Simulated Dispatch Timeline Preview (First 5)
                      </span>
                      <div className="border rounded-md p-2 bg-muted/20 divide-y max-h-36 overflow-y-auto text-xs font-mono">
                        {calculatedSchedule.items.slice(0, 5).map((item, idx) => (
                          <div key={idx} className="py-1.5 flex items-center justify-between">
                            <span>
                              {format(item.scheduledAt, "MMM d, h:mm:ss a")}
                            </span>
                            <span className="text-muted-foreground">{item.customer.name} ({item.customer.phone})</span>
                          </div>
                        ))}
                        {calculatedSchedule.items.length > 5 && (
                          <div className="py-1.5 text-center text-muted-foreground">
                            ... and {calculatedSchedule.items.length - 5} more scheduled randomly
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={savingCampaign || selectedPhones.size === 0}>
                  {savingCampaign ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Scheduling Messages...
                    </>
                  ) : (
                    <>
                      <CalendarClock className="h-4 w-4 mr-2" />
                      Confirm & Schedule Broadcast
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Campaign Messages Detail Modal */}
        <Dialog open={!!selectedCampaign} onOpenChange={(open) => !open && setSelectedCampaign(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            {selectedCampaign && (
              <div className="space-y-4">
                <DialogHeader>
                  <DialogTitle className="text-xl flex items-center justify-between">
                    <span>{selectedCampaign.title}</span>
                    <Badge variant="outline">
                      {selectedCampaign.sent_count} / {selectedCampaign.total_recipients} Delivered
                    </Badge>
                  </DialogTitle>
                  <DialogDescription>
                    Individual message delivery queue and scheduled timestamps.
                  </DialogDescription>
                </DialogHeader>

                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Scheduled Time</TableHead>
                        <TableHead>Sent Time</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {messagesLoading ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            Loading message schedule...
                          </TableCell>
                        </TableRow>
                      ) : campaignMessages.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            No messages found for this campaign.
                          </TableCell>
                        </TableRow>
                      ) : (
                        campaignMessages.map((m) => (
                          <TableRow key={m.id} className="text-xs">
                            <TableCell className="font-medium">{m.customer_name}</TableCell>
                            <TableCell className="font-mono">{m.phone_number}</TableCell>
                            <TableCell className="font-mono text-muted-foreground">
                              {format(parseISO(m.scheduled_at), "MMM d, h:mm:ss a")}
                            </TableCell>
                            <TableCell className="font-mono text-muted-foreground">
                              {m.sent_at ? format(parseISO(m.sent_at), "MMM d, h:mm:ss a") : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge
                                variant={
                                  m.status === "sent"
                                    ? "default"
                                    : m.status === "failed"
                                    ? "destructive"
                                    : "secondary"
                                }
                                className={m.status === "sent" ? "bg-green-100 text-green-800 border-0" : ""}
                              >
                                {m.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
