import { Router } from 'express';
import { getRequestId } from '../../core/http/requestContext.js';
import { sendData } from '../../core/http/response.js';
import { requireAuthentication, requireCsrf, requirePermission } from '../auth/auth.middleware.js';
import { getPrincipal } from '../auth/auth.types.js';
import {
  deactivateMasterSchema,
  itemCategoryCreateSchema,
  itemCategoryUpdateSchema,
  itemCreateSchema,
  itemUpdateSchema,
  masterIdParamsSchema,
  masterListQuerySchema,
  unitCreateSchema,
  unitUpdateSchema,
  vendorCreateSchema,
  vendorUpdateSchema,
} from './masters.schemas.js';
import { mastersService } from './masters.service.js';

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

  router.get('/items', requirePermission('procurement.item.read'), async (request, response) => {
    sendData(request, response, await mastersService.listItems(getPrincipal(request), masterListQuerySchema.parse(request.query)));
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

  router.get('/vendors', requirePermission('procurement.vendor.read'), async (request, response) => {
    sendData(request, response, await mastersService.listVendors(getPrincipal(request), masterListQuerySchema.parse(request.query)));
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

  return router;
}
