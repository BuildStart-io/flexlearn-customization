import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Users,
  Search,
  UserPlus,
  MessageSquare,
  Eye,
  Download,
  DollarSign,
  GraduationCap,
  Sparkles,
  Phone,
  MapPin,
  Calendar,
  CreditCard,
  Package,
  CalendarClock,
  Clock
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import AddCustomerDialog from "@/components/customers/AddCustomerDialog";

interface OrderRecord {
  id: string;
  customer_name: string;
  customer_phone: string;
  whatsapp_phone: string | null;
  district: string | null;
  customer_address: string | null;
  order_items: any;
  special_instructions: string | null;
  payment_method: string;
  status: string;
  total_amount: number;
  created_at: string;
}

interface CustomerAggregate {
  phone: string;
  name: string;
  email: string | null;
  persona: string | null;
  district: string | null;
  address: string | null;
  totalSpent: number;
  orderCount: number;
  products: string[];
  lastOrderDate: string;
  latestStatus: string;
  orders: OrderRecord[];
}

export default function Customers() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [districtFilter, setDistrictFilter] = useState("all");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerAggregate | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setOrders((data as any) || []);
    } catch (err: any) {
      console.error("Error fetching orders for customers:", err);
      toast({
        title: "Error loading customers",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // Aggregate orders by phone number into unique customer profiles
  const customers = useMemo(() => {
    const map = new Map<string, CustomerAggregate>();

    for (const ord of orders) {
      const phoneKey = (ord.whatsapp_phone || ord.customer_phone || "").replace(/\D/g, "");
      if (!phoneKey) continue;

      let email: string | null = null;
      let persona: string | null = null;

      if (ord.special_instructions) {
        const emailMatch = ord.special_instructions.match(/Email:\s*([^\s|]+)/i);
        if (emailMatch) email = emailMatch[1];

        const personaMatch = ord.special_instructions.match(/Persona:\s*([^|]+)/i);
        if (personaMatch) persona = personaMatch[1].trim();
      }

      // Extract products from jsonb order_items
      const prods: string[] = [];
      if (Array.isArray(ord.order_items)) {
        for (const item of ord.order_items) {
          if (item?.name) prods.push(item.name);
        }
      }

      if (!map.has(phoneKey)) {
        map.set(phoneKey, {
          phone: phoneKey,
          name: ord.customer_name || "Valued Student",
          email,
          persona,
          district: ord.district,
          address: ord.customer_address,
          totalSpent: Number(ord.total_amount) || 0,
          orderCount: 1,
          products: prods,
          lastOrderDate: ord.created_at,
          latestStatus: ord.status,
          orders: [ord],
        });
      } else {
        const existing = map.get(phoneKey)!;
        existing.totalSpent += Number(ord.total_amount) || 0;
        existing.orderCount += 1;
        if (!existing.email && email) existing.email = email;
        if (!existing.persona && persona) existing.persona = persona;
        if (!existing.district && ord.district) existing.district = ord.district;
        if (!existing.address && ord.customer_address) existing.address = ord.customer_address;
        for (const p of prods) {
          if (!existing.products.includes(p)) existing.products.push(p);
        }
        existing.orders.push(ord);
      }
    }

    return Array.from(map.values());
  }, [orders]);

  // Filtered customer list
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone.includes(searchQuery) ||
        (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (c.district && c.district.toLowerCase().includes(searchQuery.toLowerCase())) ||
        c.products.some((p) => p.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "paid" && ["delivered", "processing"].includes(c.latestStatus)) ||
        c.latestStatus === statusFilter;

      const matchesDistrict =
        districtFilter === "all" || c.district === districtFilter;

      return matchesSearch && matchesStatus && matchesDistrict;
    });
  }, [customers, searchQuery, statusFilter, districtFilter]);

  // Summary Metrics
  const totalRevenue = useMemo(() => {
    return customers.reduce((sum, c) => sum + c.totalSpent, 0);
  }, [customers]);

  const avgOrderValue = useMemo(() => {
    if (customers.length === 0) return 0;
    return Math.round(totalRevenue / customers.length);
  }, [customers, totalRevenue]);

  const districtsList = useMemo(() => {
    const set = new Set<string>();
    for (const c of customers) {
      if (c.district) set.add(c.district);
    }
    return Array.from(set).sort();
  }, [customers]);

  const exportCSV = () => {
    if (filteredCustomers.length === 0) {
      toast({ title: "No data to export" });
      return;
    }

    const headers = ["Customer Name", "Phone", "Email", "Persona", "District", "Address", "Total Spent (LKR)", "Orders Count", "Enrolled Products", "Last Order Date", "Status"];
    const rows = filteredCustomers.map((c) => [
      `"${c.name.replace(/"/g, '""')}"`,
      `"${c.phone}"`,
      `"${c.email || ""}"`,
      `"${c.persona || ""}"`,
      `"${c.district || ""}"`,
      `"${(c.address || "").replace(/"/g, '""')}"`,
      c.totalSpent,
      c.orderCount,
      `"${c.products.join(", ").replace(/"/g, '""')}"`,
      format(new Date(c.lastOrderDate), "yyyy-MM-dd HH:mm"),
      c.latestStatus,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `buildstart_customers_${format(new Date(), "yyyyMMdd_HHmm")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Customers</h1>
            <p className="text-muted-foreground text-sm">
              Manage verified students and paying customer records
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV} disabled={filteredCustomers.length === 0}>
              <Download className="h-4 w-4 mr-1.5" />
              Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/dashboard/schedule")}
              className="border-primary/30 text-primary hover:bg-primary/10"
            >
              <CalendarClock className="h-4 w-4 mr-1.5" />
              Schedule Broadcast
            </Button>
            <Button size="sm" onClick={() => setShowAddModal(true)}>
              <UserPlus className="h-4 w-4 mr-1.5" />
              Add Customer
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Customer List</CardTitle>
            <CardDescription>
              {customers.length} customer{customers.length !== 1 ? "s" : ""} found
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by customer name, WhatsApp phone, district, product..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Payment Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="paid">Paid / Active</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>

                {districtsList.length > 0 && (
                  <Select value={districtFilter} onValueChange={setDistrictFilter}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="District" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Districts</SelectItem>
                      {districtsList.map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* Customers Table */}
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer / Student</TableHead>
                  <TableHead>WhatsApp Contact</TableHead>
                  <TableHead>District</TableHead>
                  <TableHead>Enrolled Program</TableHead>
                  <TableHead className="text-right">Total Spent</TableHead>
                  <TableHead>Latest Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      Loading customer records...
                    </TableCell>
                  </TableRow>
                ) : filteredCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      <Users className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                      <p className="text-base font-medium">No customer records found</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        When orders are placed via WhatsApp AI or entered manually, paying customers will appear here.
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-4"
                        onClick={() => setShowAddModal(true)}
                      >
                        <UserPlus className="h-4 w-4 mr-1.5" />
                        Add First Customer
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCustomers.map((cust) => (
                    <TableRow key={cust.phone} className="hover:bg-muted/40 transition-colors">
                      <TableCell>
                        <div className="font-medium text-foreground">{cust.name}</div>
                        {cust.persona && (
                          <Badge variant="secondary" className="mt-1 text-[11px] font-normal">
                            {cust.persona}
                          </Badge>
                        )}
                        {cust.email && (
                          <div className="text-xs text-muted-foreground mt-0.5">{cust.email}</div>
                        )}
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-1.5 font-mono text-sm">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                          {cust.phone}
                        </div>
                      </TableCell>

                      <TableCell>
                        {cust.district ? (
                          <div className="flex items-center gap-1 text-sm">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                            {cust.district}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>

                      <TableCell>
                        <div className="text-sm font-medium">
                          {cust.products.length > 0
                            ? cust.products[0]
                            : "90-Day SME Growth Challenge"}
                        </div>
                        {cust.products.length > 1 && (
                          <span className="text-xs text-muted-foreground">
                            +{cust.products.length - 1} more
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="text-right font-medium">
                        <div>LKR {cust.totalSpent.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">{cust.orderCount} order(s)</div>
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant={
                            cust.latestStatus === "delivered"
                              ? "default"
                              : cust.latestStatus === "processing"
                              ? "secondary"
                              : "outline"
                          }
                          className={
                            cust.latestStatus === "delivered"
                              ? "bg-green-100 text-green-800 hover:bg-green-200 border-0"
                              : cust.latestStatus === "processing"
                              ? "bg-blue-100 text-blue-800 hover:bg-blue-200 border-0"
                              : ""
                          }
                        >
                          {cust.latestStatus === "delivered"
                            ? "Paid & Active"
                            : cust.latestStatus}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-primary hover:bg-primary/10"
                            title="Open WhatsApp Chat"
                            onClick={() => navigate(`/dashboard/conversations?phone=${cust.phone}`)}
                          >
                            <MessageSquare className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            title="View Customer Profile"
                            onClick={() => setSelectedCustomer(cust)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>

        {/* Customer Profile & Orders Dialog */}
        <Dialog open={!!selectedCustomer} onOpenChange={(open) => !open && setSelectedCustomer(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            {selectedCustomer && (
              <div className="space-y-6">
                <DialogHeader>
                  <DialogTitle className="text-xl flex items-center justify-between">
                    <span>{selectedCustomer.name}</span>
                    <Badge variant="outline">
                      {selectedCustomer.orderCount} Total Order(s)
                    </Badge>
                  </DialogTitle>
                  <DialogDescription>
                    Student enrollment details and order history.
                  </DialogDescription>
                </DialogHeader>

                {/* Customer Info Card */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 bg-muted/40 rounded-lg border text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground block">WhatsApp Phone</span>
                    <span className="font-mono font-medium">{selectedCustomer.phone}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Email</span>
                    <span>{selectedCustomer.email || "Not specified"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">District</span>
                    <span>{selectedCustomer.district || "Not specified"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Student Persona</span>
                    <span>{selectedCustomer.persona || "Standard"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Total Lifetime Spend</span>
                    <span className="font-semibold text-green-600">
                      LKR {selectedCustomer.totalSpent.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground block">Address</span>
                    <span className="truncate block">{selectedCustomer.address || "—"}</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => {
                      const ph = selectedCustomer.phone;
                      setSelectedCustomer(null);
                      navigate(`/dashboard/conversations?phone=${ph}`);
                    }}
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Open WhatsApp Chat Thread
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const ph = selectedCustomer.phone;
                      setSelectedCustomer(null);
                      navigate(`/dashboard/schedule?phone=${ph}`);
                    }}
                  >
                    <Clock className="h-4 w-4 mr-2" />
                    Schedule Broadcast
                  </Button>
                </div>

                {/* Order History */}
                <div>
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Package className="h-4 w-4 text-primary" />
                    Order & Payment History
                  </h3>
                  <div className="space-y-3">
                    {selectedCustomer.orders.map((ord) => (
                      <div key={ord.id} className="p-3 border rounded-md text-sm space-y-2 bg-card">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs text-muted-foreground">
                            Order #{ord.id.substring(0, 8)} • {format(new Date(ord.created_at), "MMM d, yyyy h:mm a")}
                          </span>
                          <Badge variant="outline" className="capitalize">
                            {ord.status}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between font-medium">
                          <span>
                            {Array.isArray(ord.order_items) && ord.order_items.length > 0
                              ? ord.order_items.map((i: any) => i.name).join(", ")
                              : "90-Day SME Challenge"}
                          </span>
                          <span className="text-green-600 font-semibold">
                            LKR {Number(ord.total_amount)?.toLocaleString()}
                          </span>
                        </div>
                        {ord.special_instructions && (
                          <p className="text-xs text-muted-foreground italic border-t pt-1.5">
                            {ord.special_instructions}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Add Customer Modal */}
        <AddCustomerDialog
          open={showAddModal}
          onOpenChange={setShowAddModal}
          onSuccess={() => {
            fetchOrders();
          }}
        />
      </div>
    </DashboardLayout>
  );
}
