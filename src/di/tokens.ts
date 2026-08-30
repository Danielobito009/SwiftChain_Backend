/**
 * DI Container Token Definitions
 *
 * This file defines all named injection tokens used throughout the Awilix DI container.
 * Tokens are organized by category (Services, Models, Controllers, Config) for clarity.
 */

export const TOKENS = {
  // Services
  authService: 'authService',
  deliveryService: 'deliveryService',
  delivery_service: 'delivery_service', // Alternate export (delivery.service.ts)
  driverService: 'driverService',
  fleetService: 'fleetService',
  escrowService: 'escrowService',
  escrow_service: 'escrow_service', // Alternate export (escrow.service.ts)
  disputeService: 'disputeService',
  adminService: 'adminService',
  eventLogService: 'eventLogService',
  profilePictureService: 'profilePictureService',
  storageService: 'storageService',
  sorobanService: 'sorobanService',
  transactionService: 'transactionService',
  escrowMonitorService: 'escrowMonitorService',
  routingService: 'routingService',
  etaCacheService: 'etaCacheService',
  stellarService: 'stellarService',
  evidenceService: 'evidenceService',
  indexerService: 'indexerService',
  monitorService: 'monitorService',
  idempotencyService: 'idempotencyService',

  // Models (Mongoose schemas)
  userModel: 'userModel',
  deliveryModel: 'deliveryModel',
  driverProfileModel: 'driverProfileModel',
  fleetModel: 'fleetModel',
  escrowModel: 'escrowModel',
  disputeModel: 'disputeModel',
  eventLogModel: 'eventLogModel',
  evidenceModel: 'evidenceModel',
  fleetInvitationModel: 'fleetInvitationModel',
  locationUpdateModel: 'locationUpdateModel',
  chatMessageModel: 'chatMessageModel',
  indexerAlertModel: 'indexerAlertModel',
  indexerStatusModel: 'indexerStatusModel',
  idempotencyRecordModel: 'idempotencyRecordModel',

  // Config & Infrastructure
  logger: 'logger',
  redisClient: 'redisClient',
  env: 'env',

  // Controllers
  authController: 'authController',
  deliveryController: 'deliveryController',
  delivery_controller: 'delivery_controller', // Alternate export (delivery.controller.ts)
  deliveryCrudController: 'deliveryCrudController',
  deliveryStatusController: 'deliveryStatusController',
  driverController: 'driverController',
  fleetController: 'fleetController',
  escrowController: 'escrowController',
  escrow_controller: 'escrow_controller', // Alternate export (escrow.controller.ts)
  disputeController: 'disputeController',
  adminController: 'adminController',
  eventLogController: 'eventLogController',
  profileController: 'profileController',
  uploadController: 'uploadController',
  userController: 'userController',
  transactionController: 'transactionController',
  circuitBreakerController: 'circuitBreakerController',
  indexerController: 'indexerController',
  indexer_controller: 'indexer_controller', // Alternate export (indexer.controller.ts)
  monitorController: 'monitorController',
  stellarController: 'stellarController',
  stellar_controller: 'stellar_controller', // Alternate export (stellar.controller.ts)
} as const;
