import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useStaffAccess } from "@/hooks/useStaffAccess";
import { Loader2, UserPlus, Sparkles } from "lucide-react";

const SRI_LANKA_DISTRICTS = [
  "Ampara", "Anuradhapura", "Badulla", "Batticaloa", "Colombo", "Galle", "Gampaha",
  "Hambantota", "Jaffna", "Kalutara", "Kandy", "Kegalle", "Kilinochchi", "Kurunegala",
  "Mannar", "Matale", "Matara", "Monaragala", "Mullaitivu", "Nuwara Eliya", "Polonnaruwa",
  "Puttalam", "Ratnapura", "Trincomalee", "Vavuniya", "Overseas / International"
];

interface AddCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPhone?: string;
  defaultName?: string;
  onSuccess?: () => void;
}

export default function AddCustomerDialog({
  open,
  onOpenChange,
  defaultPhone = "",
  defaultName = "",
  onSuccess,
}: AddCustomerDialogProps) {
  const { user } = useAuth();
  const { effectiveUserId } = useStaffAccess();
  const { toast } = useToast();

  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [email, setEmail] = useState("");
  const [customerType, setCustomerType] = useState<string>("professional");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [products, setProducts] = useState<Array<{ id: string; name: string; price: number }>>([]);
  const [amount, setAmount] = useState<string>("4500");
  const [paymentMethod, setPaymentMethod] = useState<string>("bank_transfer");
  const [orderStatus, setOrderStatus] = useState<string>("delivered");
  const [district, setDistrict] = useState<string>("Colombo");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(defaultName || "");
      setPhone(defaultPhone || "");
      fetchProducts();
    }
  }, [open, defaultPhone, defaultName]);

  const fetchProducts = async () => {
    try {
      const ownerId = effectiveUserId || user?.id;
      if (!ownerId) return;

      const { data, error } = await supabase
        .from("products")
        .select("id, name, price")
        .eq("user_id", ownerId)
        .eq("is_active", true);

      if (error) throw error;
      setProducts(data || []);
      if (data && data.length > 0 && !selectedProductId) {
        setSelectedProductId(data[0].id);
        setAmount(String(data[0].price || 4500));
      }
    } catch (err) {
      console.error("Error fetching products:", err);
    }
  };

  const handleProductChange = (prodId: string) => {
    setSelectedProductId(prodId);
    const prod = products.find((p) => p.id === prodId);
    if (prod) {
      setAmount(String(prod.price || 4500));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      toast({
        title: "Missing details",
        description: "Please provide both Customer Name and WhatsApp Phone Number.",
        variant: "destructive",
      });
      return;
    }

    const ownerId = effectiveUserId || user?.id;
    if (!ownerId) {
      toast({
        title: "Authentication Error",
        description: "You must be logged in to create a customer.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const selectedProd = products.find((p) => p.id === selectedProductId);
      const orderItems = selectedProd
        ? [{ id: selectedProd.id, name: selectedProd.name, price: Number(amount) || selectedProd.price, quantity: 1 }]
        : [{ name: "90-Day SME Growth Challenge", price: Number(amount) || 4500, quantity: 1 }];

      const instructions = [
        email.trim() ? `Email: ${email.trim()}` : "",
        customerType ? `Persona: ${customerType === "professional" ? "Working Professional" : "Business Owner"}` : "",
        notes.trim() ? `Notes: ${notes.trim()}` : "",
      ].filter(Boolean).join(" | ");

      const cleanPhone = phone.replace(/\D/g, "");

      // 1. Insert order into orders table
      const { data: newOrder, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: ownerId,
          customer_name: name.trim(),
          customer_phone: cleanPhone,
          whatsapp_phone: cleanPhone,
          total_amount: Number(amount) || 0,
          payment_method: paymentMethod as "cod" | "bank_transfer",
          status: orderStatus as "pending" | "processing" | "shipped" | "delivered" | "cancelled",
          district: district || null,
          customer_address: address.trim() || null,
          special_instructions: instructions || null,
          order_items: orderItems,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // 2. Update or insert lead record to keep status synced
      try {
        const { data: existingLead } = await supabase
          .from("leads")
          .select("id")
          .eq("user_id", ownerId)
          .eq("phone_number", cleanPhone)
          .maybeSingle();

        if (existingLead) {
          await supabase
            .from("leads")
            .update({
              customer_name: name.trim(),
              lead_stage: "customer",
              customer_type: customerType,
              last_interaction: new Date().toISOString(),
            })
            .eq("id", existingLead.id);
        } else {
          await supabase.from("leads").insert({
            user_id: ownerId,
            phone_number: cleanPhone,
            customer_name: name.trim(),
            lead_stage: "customer",
            customer_type: customerType,
            last_interaction: new Date().toISOString(),
          });
        }
      } catch (leadErr) {
        console.warn("Could not sync lead state:", leadErr);
      }

      toast({
        title: "Customer Added Successfully! 🎉",
        description: `${name} has been enrolled and added to your customer records.`,
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (err: any) {
      console.error("Error creating customer:", err);
      toast({
        title: "Failed to add customer",
        description: err.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Add Customer & Record Payment
            </DialogTitle>
            <DialogDescription>
              Register a paying customer directly into the BuildStart system.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cust-name">Customer / Student Name *</Label>
                <Input
                  id="cust-name"
                  placeholder="e.g. Kasun Perera"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cust-phone">WhatsApp Phone *</Label>
                <Input
                  id="cust-phone"
                  placeholder="e.g. 94771234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cust-email">Email Address</Label>
                <Input
                  id="cust-email"
                  type="email"
                  placeholder="student@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cust-type">Student Persona</Label>
                <Select value={customerType} onValueChange={setCustomerType}>
                  <SelectTrigger id="cust-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">💼 Working Professional</SelectItem>
                    <SelectItem value="business_owner">🚀 Business Owner / Entrepreneur</SelectItem>
                    <SelectItem value="student">🎓 Higher Ed Student</SelectItem>
                    <SelectItem value="other">👤 Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cust-prod">Enrolled Product / Course</Label>
              <Select value={selectedProductId} onValueChange={handleProductChange}>
                <SelectTrigger id="cust-prod">
                  <SelectValue placeholder="Select course/product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} (LKR {p.price?.toLocaleString()})
                    </SelectItem>
                  ))}
                  {products.length === 0 && (
                    <SelectItem value="default">90-Day SME Growth, Sales & Leadership Challenge</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cust-amount">Amount (LKR) *</Label>
                <Input
                  id="cust-amount"
                  type="number"
                  placeholder="4500"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cust-pay">Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger id="cust-pay">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_transfer">🏦 Bank Transfer (Sampath / Commercial)</SelectItem>
                    <SelectItem value="cod">💳 Online / PayHere</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cust-status">Order Status</Label>
                <Select value={orderStatus} onValueChange={setOrderStatus}>
                  <SelectTrigger id="cust-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="delivered">✅ Paid & Active (Delivered)</SelectItem>
                    <SelectItem value="processing">⏳ Processing / Slip Verification</SelectItem>
                    <SelectItem value="pending">📝 Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cust-district">District / Location</Label>
                <Select value={district} onValueChange={setDistrict}>
                  <SelectTrigger id="cust-district">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SRI_LANKA_DISTRICTS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cust-addr">City / Address</Label>
                <Input
                  id="cust-addr"
                  placeholder="e.g. Nugegoda, Colombo"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cust-notes">Special Instructions / LMS Login Notes</Label>
              <Textarea
                id="cust-notes"
                placeholder="Credentials sent for flexlearn.lk / special batch notes..."
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add Customer
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
