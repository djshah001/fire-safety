import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  CheckCircle,
  Clock,
  Plus,
  Receipt,
  User,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/api/client';
import {
  createProjectExpense,
  projectExpensesQuery,
  reviewProjectExpense,
  type ExpenseStatus,
  type ProjectExpense,
} from '@/api/execution';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

const expenseStatusBadges: Record<
  ExpenseStatus,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  submitted: { label: 'Submitted', variant: 'secondary' },
  approved: { label: 'Approved', variant: 'default' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  reimbursed: { label: 'Reimbursed', variant: 'outline' },
};

const categoryLabels: Record<string, string> = {
  travel: 'Site Travel / Fuel',
  transport: 'Material Transport / Tempo',
  local_purchase: 'Local Hardware Purchase',
  labour_wages: 'Daily Labour / Overtime',
  permits: 'Site Permits / Gate Passes',
  miscellaneous: 'Miscellaneous Site Expense',
};

export function ExpensesTab({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const expensesQuery = useQuery(projectExpensesQuery(projectId));

  // Dialogs
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<ProjectExpense | null>(null);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>('approve');
  const [reviewNotes, setReviewNotes] = useState('');

  // Form states - Create
  const [category, setCategory] = useState('local_purchase');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]!);
  const [description, setDescription] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');

  const createExpenseMutation = useMutation({
    mutationFn: (input: Parameters<typeof createProjectExpense>[1]) =>
      createProjectExpense(projectId, input),
    onSuccess: () => {
      toast.success('Site expense logged successfully');
      setCreateDialogOpen(false);
      setAmount('');
      setDescription('');
      setReceiptUrl('');
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'expenses'] });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to log expense'));
    },
  });

  const reviewExpenseMutation = useMutation({
    mutationFn: (input: { action: 'approve' | 'reject'; reviewNotes?: string }) =>
      reviewProjectExpense(projectId, selectedExpense!.id, input),
    onSuccess: () => {
      toast.success(
        reviewAction === 'approve' ? 'Expense approved' : 'Expense rejected',
      );
      setReviewDialogOpen(false);
      setReviewNotes('');
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'expenses'] });
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Failed to review expense'));
    },
  });

  const expenses = expensesQuery.data || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Site Petty Expenses</h2>
          <p className="text-sm text-muted-foreground">
            On-site operational expenses logged by site engineers awaiting commercial/project manager verification.
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-1.5 size-4" />
          Log Expense
        </Button>
      </div>

      {expenses.length === 0 ? (
        <Card className="border-dashed py-8 text-center text-muted-foreground">
          <Receipt className="mx-auto mb-2 size-8 opacity-40" />
          <p>No site expenses recorded for this project.</p>
          <p className="text-xs">
            Site engineers can log local purchases, urgent transport, and site utilities.
          </p>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Expense #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Logged By</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((expense) => {
                const badge = expenseStatusBadges[expense.status] || {
                  label: expense.status,
                  variant: 'outline',
                };
                return (
                  <TableRow key={expense.id}>
                    <TableCell className="font-mono text-xs font-semibold text-primary">
                      {expense.expenseNumber}
                    </TableCell>
                    <TableCell className="text-xs">{expense.expenseDate}</TableCell>
                    <TableCell className="text-xs">
                      {categoryLabels[expense.category] || expense.category}
                    </TableCell>
                    <TableCell className="font-semibold text-xs">
                      ₹{Number(expense.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                      {expense.description}
                    </TableCell>
                    <TableCell>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {expense.submittedByName}
                    </TableCell>
                    <TableCell className="text-right">
                      {expense.status === 'submitted' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedExpense(expense);
                            setReviewDialogOpen(true);
                          }}
                        >
                          Review
                        </Button>
                      )}
                      {expense.status !== 'submitted' && expense.reviewNotes && (
                        <span className="text-xs text-muted-foreground truncate max-w-[150px] inline-block">
                          {expense.reviewNotes}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Dialog: Log Expense */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Log Site Petty Expense</DialogTitle>
            <DialogDescription>
              Record an on-site cash or card expense with receipt details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Expense Category *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local_purchase">Local Hardware / Consumables</SelectItem>
                  <SelectItem value="transport">Material Transport / Local Tempo</SelectItem>
                  <SelectItem value="travel">Site Travel & Conveyance</SelectItem>
                  <SelectItem value="labour_wages">Daily Labour / Overtime Wages</SelectItem>
                  <SelectItem value="permits">Site Entry / Work Permits</SelectItem>
                  <SelectItem value="miscellaneous">Miscellaneous Site Expense</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="exp-amt">Amount (₹) *</Label>
                <Input
                  id="exp-amt"
                  type="number"
                  min="1"
                  step="0.01"
                  placeholder="e.g. 1500"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="exp-date">Expense Date *</Label>
                <Input
                  id="exp-date"
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exp-desc">Description & Purpose *</Label>
              <Textarea
                id="exp-desc"
                rows={2}
                placeholder="e.g. Purchased 10 nos fastner anchors and Teflon tape from local hardware shop"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="exp-receipt">Receipt Image / Bill URL (Optional)</Label>
              <Input
                id="exp-receipt"
                placeholder="https://... or receipt ref #"
                value={receiptUrl}
                onChange={(e) => setReceiptUrl(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!amount || Number(amount) <= 0 || !description.trim() || createExpenseMutation.isPending}
              onClick={() =>
                createExpenseMutation.mutate({
                  category,
                  amount: Number(amount),
                  expenseDate,
                  description: description.trim(),
                  receiptFileUrl: receiptUrl.trim() || undefined,
                })
              }
            >
              {createExpenseMutation.isPending ? 'Saving...' : 'Record Expense'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Review Expense */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Site Expense</DialogTitle>
            <DialogDescription>
              {selectedExpense?.expenseNumber}: ₹{selectedExpense?.amount} ({selectedExpense?.category})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Action</Label>
              <Select
                value={reviewAction}
                onValueChange={(val) => setReviewAction(val as 'approve' | 'reject')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approve">Approve Expense</SelectItem>
                  <SelectItem value="reject">Reject Expense</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-notes">Review Notes (Optional)</Label>
              <Textarea
                id="exp-notes"
                rows={2}
                placeholder="Verification comments or billing account notes..."
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReviewDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={reviewAction === 'approve' ? 'default' : 'destructive'}
              disabled={reviewExpenseMutation.isPending}
              onClick={() =>
                reviewExpenseMutation.mutate({
                  action: reviewAction,
                  reviewNotes: reviewNotes.trim() || undefined,
                })
              }
            >
              {reviewExpenseMutation.isPending ? 'Processing...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

