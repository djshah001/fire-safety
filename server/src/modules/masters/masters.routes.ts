import { Router } from 'express';
import { AppError } from '../../core/errors/appError.js';
import { getRequestId } from '../../core/http/requestContext.js';
import { sendData } from '../../core/http/response.js';
import { createPrivateUpload } from '../../infrastructure/storage/localFileStorage.js';
import { requireAuthentication, requireCsrf, requirePermission } from '../auth/auth.middleware.js';
import { getPrincipal } from '../auth/auth.types.js';
import {
  archiveVendorSchema,
  approveVendorSchema,
  brandCreateSchema,
  brandUpdateSchema,
  createVendorInvitationSchema,
  deactivateMasterSchema,
  itemCategoryCreateSchema,
  itemCategoryUpdateSchema,
  itemCreateSchema,
  itemFamilyCreateSchema,
  itemFamilyUpdateSchema,
  itemOfferingCreateSchema,
  itemOfferingParamsSchema,
  itemOfferingUpdateSchema,
  itemRateCreateSchema,
  itemUpdateSchema,
  masterIdParamsSchema,
  masterListQuerySchema,
  unitCreateSchema,
  unitUpdateSchema,
  vendorCreateSchema,
  vendorDuplicateCheckSchema,
  vendorPriceListCreateSchema,
  vendorPriceListParamsSchema,
  vendorPriceListUpdateSchema,
  vendorUpdateSchema,
} from './masters.schemas.js';
import { mastersService } from './masters.service.js';

const vendorDocUpload = createPrivateUpload({
  allowedMimeTypes: new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  maxFileBytes: 20 * 1024 * 1024,
});

export function createMastersRouter() {
  const router = Router();
  router.use(requireAuthentication);

  router.get('/units', requirePermission('procurement.item.read'), async (request, response) => {
    sendData(request, response, await mastersService.listUnits(getPrincipal(request), masterListQuerySchema.parse(request.query)));
  });
  router.post('/units', requireCsrf, requirePermission('procurement.item.manage'), async (request, response) => {
    const unit = await mastersService.createUnit(getPrincipal(request), unitCreateSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { unit }, 201);
  });
  router.put('/units/:id', requireCsrf, requirePermission('procurement.item.manage'), async (request, response) => {
    const { id } = masterIdParamsSchema.parse(request.params);
    const unit = await mastersService.updateUnit(getPrincipal(request), id, unitUpdateSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { unit });
  });
  router.post('/units/:id/deactivate', requireCsrf, requirePermission('procurement.item.manage'), async (request, response) => {
    const { id } = masterIdParamsSchema.parse(request.params);
    const input = deactivateMasterSchema.parse(request.body);
    const unit = await mastersService.deactivateUnit(getPrincipal(request), id, input.expectedVersion, input.reason, getRequestId(request));
    sendData(request, response, { unit });
  });

  router.get('/item-categories', requirePermission('procurement.item.read'), async (request, response) => {
    sendData(request, response, await mastersService.listItemCategories(getPrincipal(request), masterListQuerySchema.parse(request.query)));
  });
  router.post('/item-categories', requireCsrf, requirePermission('procurement.item.manage'), async (request, response) => {
    const category = await mastersService.createItemCategory(getPrincipal(request), itemCategoryCreateSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { category }, 201);
  });
  router.put('/item-categories/:id', requireCsrf, requirePermission('procurement.item.manage'), async (request, response) => {
    const { id } = masterIdParamsSchema.parse(request.params);
    const category = await mastersService.updateItemCategory(getPrincipal(request), id, itemCategoryUpdateSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { category });
  });
  router.post('/item-categories/:id/deactivate', requireCsrf, requirePermission('procurement.item.manage'), async (request, response) => {
    const { id } = masterIdParamsSchema.parse(request.params);
    const input = deactivateMasterSchema.parse(request.body);
    const category = await mastersService.deactivateItemCategory(getPrincipal(request), id, input.expectedVersion, input.reason, getRequestId(request));
    sendData(request, response, { category });
  });

  router.get('/brands', requirePermission('procurement.item.read'), async (request, response) => {
    sendData(request, response, await mastersService.listBrands(getPrincipal(request), masterListQuerySchema.parse(request.query)));
  });
  router.post('/brands', requireCsrf, requirePermission('procurement.item.manage'), async (request, response) => {
    const brand = await mastersService.createBrand(getPrincipal(request), brandCreateSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { brand }, 201);
  });
  router.put('/brands/:id', requireCsrf, requirePermission('procurement.item.manage'), async (request, response) => {
    const { id } = masterIdParamsSchema.parse(request.params);
    const brand = await mastersService.updateBrand(getPrincipal(request), id, brandUpdateSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { brand });
  });
  router.post('/brands/:id/deactivate', requireCsrf, requirePermission('procurement.item.manage'), async (request, response) => {
    const { id } = masterIdParamsSchema.parse(request.params);
    const input = deactivateMasterSchema.parse(request.body);
    const brand = await mastersService.deactivateBrand(getPrincipal(request), id, input.expectedVersion, input.reason, getRequestId(request));
    sendData(request, response, { brand });
  });

  router.get('/items', requirePermission('procurement.item.read'), async (request, response) => {
    sendData(request, response, await mastersService.listItems(getPrincipal(request), masterListQuerySchema.parse(request.query)));
  });
  router.get('/item-families', requirePermission('procurement.item.read'), async (request, response) => {
    sendData(request, response, await mastersService.listItemFamilies(getPrincipal(request), masterListQuerySchema.parse(request.query)));
  });
  router.post('/item-families', requireCsrf, requirePermission('procurement.item.manage'), async (request, response) => {
    const family = await mastersService.createItemFamily(getPrincipal(request), itemFamilyCreateSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { family }, 201);
  });
  router.put('/item-families/:id', requireCsrf, requirePermission('procurement.item.manage'), async (request, response) => {
    const { id } = masterIdParamsSchema.parse(request.params);
    const family = await mastersService.updateItemFamily(getPrincipal(request), id, itemFamilyUpdateSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { family });
  });
  router.post('/item-families/:id/deactivate', requireCsrf, requirePermission('procurement.item.manage'), async (request, response) => {
    const { id } = masterIdParamsSchema.parse(request.params);
    const input = deactivateMasterSchema.parse(request.body);
    const family = await mastersService.deactivateItemFamily(getPrincipal(request), id, input.expectedVersion, input.reason, getRequestId(request));
    sendData(request, response, { family });
  });
  router.post('/items', requireCsrf, requirePermission('procurement.item.manage'), async (request, response) => {
    const item = await mastersService.createItem(getPrincipal(request), itemCreateSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { item }, 201);
  });
  router.put('/items/:id', requireCsrf, requirePermission('procurement.item.manage'), async (request, response) => {
    const { id } = masterIdParamsSchema.parse(request.params);
    const item = await mastersService.updateItem(getPrincipal(request), id, itemUpdateSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { item });
  });
  router.post('/items/:id/deactivate', requireCsrf, requirePermission('procurement.item.manage'), async (request, response) => {
    const { id } = masterIdParamsSchema.parse(request.params);
    const input = deactivateMasterSchema.parse(request.body);
    const item = await mastersService.deactivateItem(getPrincipal(request), id, input.expectedVersion, input.reason, getRequestId(request));
    sendData(request, response, { item });
  });
  router.get('/items/:id/offerings', requirePermission('procurement.item.read'), async (request, response) => {
    const { id } = masterIdParamsSchema.parse(request.params);
    sendData(request, response, { offerings: await mastersService.listItemOfferings(getPrincipal(request), id) });
  });
  router.post('/items/:id/offerings', requireCsrf, requirePermission('procurement.item.manage'), async (request, response) => {
    const { id } = masterIdParamsSchema.parse(request.params);
    const offering = await mastersService.createItemOffering(getPrincipal(request), id, itemOfferingCreateSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { offering }, 201);
  });
  router.put('/items/:id/offerings/:offeringId', requireCsrf, requirePermission('procurement.item.manage'), async (request, response) => {
    const { id, offeringId } = itemOfferingParamsSchema.parse(request.params);
    const offering = await mastersService.updateItemOffering(getPrincipal(request), id, offeringId, itemOfferingUpdateSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { offering });
  });
  router.post('/items/:id/offerings/:offeringId/deactivate', requireCsrf, requirePermission('procurement.item.manage'), async (request, response) => {
    const { id, offeringId } = itemOfferingParamsSchema.parse(request.params);
    const input = deactivateMasterSchema.parse(request.body);
    const offering = await mastersService.deactivateItemOffering(getPrincipal(request), id, offeringId, input.expectedVersion, input.reason, getRequestId(request));
    sendData(request, response, { offering });
  });
  router.get('/items/:id/offerings/:offeringId/rates', requirePermission('procurement.item.read'), async (request, response) => {
    const { id, offeringId } = itemOfferingParamsSchema.parse(request.params);
    sendData(request, response, { rates: await mastersService.listItemRates(getPrincipal(request), id, offeringId) });
  });
  router.post('/items/:id/offerings/:offeringId/rates', requireCsrf, requirePermission('procurement.item_rate.manage'), async (request, response) => {
    const { id, offeringId } = itemOfferingParamsSchema.parse(request.params);
    const rate = await mastersService.createItemRate(getPrincipal(request), id, offeringId, itemRateCreateSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { rate }, 201);
  });

  router.get('/vendors', requirePermission('procurement.vendor.read'), async (request, response) => {
    sendData(request, response, await mastersService.listVendors(getPrincipal(request), masterListQuerySchema.parse(request.query)));
  });
  router.get('/vendors/:id', requirePermission('procurement.vendor.read'), async (request, response) => {
    const { id } = masterIdParamsSchema.parse(request.params);
    sendData(request, response, { vendor: await mastersService.getVendor(getPrincipal(request), id) });
  });
  router.post('/vendors/check-duplicates', requirePermission('procurement.vendor.read'), async (request, response) => {
    const input = vendorDuplicateCheckSchema.parse(request.body);
    sendData(request, response, await mastersService.checkVendorDuplicates(getPrincipal(request), input));
  });
  router.post('/vendors', requireCsrf, requirePermission('procurement.vendor.manage'), async (request, response) => {
    const vendor = await mastersService.createVendor(getPrincipal(request), vendorCreateSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { vendor }, 201);
  });
  router.put('/vendors/:id', requireCsrf, requirePermission('procurement.vendor.manage'), async (request, response) => {
    const { id } = masterIdParamsSchema.parse(request.params);
    const vendor = await mastersService.updateVendor(getPrincipal(request), id, vendorUpdateSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { vendor });
  });
  router.post('/vendors/:id/deactivate', requireCsrf, requirePermission('procurement.vendor.manage'), async (request, response) => {
    const { id } = masterIdParamsSchema.parse(request.params);
    const input = deactivateMasterSchema.parse(request.body);
    const vendor = await mastersService.deactivateVendor(getPrincipal(request), id, input.expectedVersion, input.reason, getRequestId(request));
    sendData(request, response, { vendor });
  });
  router.post('/vendors/:id/archive', requireCsrf, requirePermission('procurement.vendor.manage'), async (request, response) => {
    const { id } = masterIdParamsSchema.parse(request.params);
    const input = archiveVendorSchema.parse(request.body);
    const vendor = await mastersService.archiveVendor(getPrincipal(request), id, input.expectedVersion, input.reason, getRequestId(request));
    sendData(request, response, { vendor });
  });
  router.post('/vendors/:id/approve', requireCsrf, requirePermission('procurement.vendor.manage'), async (request, response) => {
    const { id } = masterIdParamsSchema.parse(request.params);
    const input = approveVendorSchema.parse(request.body);
    const vendor = await mastersService.approveVendor(getPrincipal(request), id, input.expectedVersion, getRequestId(request));
    sendData(request, response, { vendor });
  });

  // Price List
  router.get('/vendors/:id/price-list', requirePermission('procurement.vendor.read'), async (request, response) => {
    const { id } = masterIdParamsSchema.parse(request.params);
    sendData(request, response, { items: await mastersService.listVendorPriceList(getPrincipal(request), id) });
  });
  router.post('/vendors/:id/price-list', requireCsrf, requirePermission('procurement.vendor.manage'), async (request, response) => {
    const { id } = masterIdParamsSchema.parse(request.params);
    const item = await mastersService.createVendorPriceListItem(getPrincipal(request), id, vendorPriceListCreateSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { item }, 201);
  });
  router.put('/vendors/:id/price-list/:priceListId', requireCsrf, requirePermission('procurement.vendor.manage'), async (request, response) => {
    const { id, priceListId } = vendorPriceListParamsSchema.parse(request.params);
    const item = await mastersService.updateVendorPriceListItem(getPrincipal(request), id, priceListId, vendorPriceListUpdateSchema.parse(request.body), getRequestId(request));
    sendData(request, response, { item });
  });
  router.delete('/vendors/:id/price-list/:priceListId', requireCsrf, requirePermission('procurement.vendor.manage'), async (request, response) => {
    const { id, priceListId } = vendorPriceListParamsSchema.parse(request.params);
    const item = await mastersService.deleteVendorPriceListItem(getPrincipal(request), id, priceListId, getRequestId(request));
    sendData(request, response, { item });
  });

  // Vendor Documents
  router.post('/vendors/:id/documents', requireCsrf, requirePermission('procurement.vendor.manage'), vendorDocUpload.single('file'), async (request, response) => {
    const { id } = masterIdParamsSchema.parse(request.params);
    const documentType = (request.body.documentType as string) || 'other';
    if (!request.file) throw new AppError('VALIDATION_ERROR', 'Choose a document file to upload.', 422);
    const document = await mastersService.uploadVendorDocument(getPrincipal(request), id, documentType, request.file, getRequestId(request));
    sendData(request, response, { document }, 201);
  });
  router.delete('/vendors/:id/documents/:documentId', requireCsrf, requirePermission('procurement.vendor.manage'), async (request, response) => {
    const { id } = masterIdParamsSchema.parse(request.params);
    const documentId = request.params.documentId as string;
    const document = await mastersService.deleteVendorDocument(getPrincipal(request), id, documentId, getRequestId(request));
    sendData(request, response, { document });
  });

  // Vendor Onboarding WhatsApp Invitations
  router.post('/vendors/invitations', requireCsrf, requirePermission('procurement.vendor.manage'), async (request, response) => {
    const input = createVendorInvitationSchema.parse(request.body);
    const invitation = await mastersService.createOnboardingInvitation(getPrincipal(request), input, getRequestId(request));
    sendData(request, response, { invitation }, 201);
  });

  router.post('/vendors/invitations/:id/send-msg91', requireCsrf, requirePermission('procurement.vendor.manage'), async (request, response) => {
    const id = request.params.id as string;
    const result = await mastersService.sendVendorInvitationViaMsg91(getPrincipal(request), id, getRequestId(request));
    sendData(request, response, { result });
  });

  return router;
}
