// Fabric (New Architecture) component view for <FlyQSpatialView />.
//
// The real work happens in Swift (FlyQSpatialHostView). This wrapper:
// - creates the Swift view (looked up by its Objective-C name, so this file does not depend on the
//   generated "-Swift.h" header),
// - forwards props (venueId, debugEnabled) and the single `dispatch(command, argsJson)` command,
// - turns Swift events into the `onSpatialEvent({ name, payload })` React event, queueing the
//   ones produced before the event emitter is attached.
//
// No header file on purpose: React Native finds this class through codegenConfig.ios.components.

#import <UIKit/UIKit.h>

#import <React/RCTViewComponentView.h>

#import <react/renderer/components/FlyQSpatialSpec/ComponentDescriptors.h>
#import <react/renderer/components/FlyQSpatialSpec/EventEmitters.h>
#import <react/renderer/components/FlyQSpatialSpec/Props.h>
#import <react/renderer/components/FlyQSpatialSpec/RCTComponentViewHelpers.h>

#include <string>

using namespace facebook::react;

/// Selectors implemented by the Swift class FlyQSpatialHostView.
@protocol FlyQSpatialHostViewAPI <NSObject>
- (void)applyVenueId:(NSString *)venueId;
- (void)applyDebugEnabled:(BOOL)enabled;
- (void)dispatchCommand:(NSString *)command argsJson:(NSString *)argsJson;
- (void)invalidateSpatial;
- (void)setOnEvent:(void (^_Nullable)(NSString *name, NSString *payload))onEvent;
@end

@interface FlyQSpatialViewComponentView : RCTViewComponentView <RCTFlyQSpatialViewViewProtocol>
@end

@implementation FlyQSpatialViewComponentView {
  UIView<FlyQSpatialHostViewAPI> *_hostView;
  NSMutableArray<NSArray<NSString *> *> *_pendingEvents;
  BOOL _didApplyInitialProps;
}

// Forces the class to be realised at load time (same as react-native-safe-area-context).
+ (void)load
{
  [super load];
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<FlyQSpatialViewComponentDescriptor>();
}

// The AR session and the loaded model must not be handed to another instance.
+ (BOOL)shouldBeRecycled
{
  return NO;
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const FlyQSpatialViewProps>();
    _props = defaultProps;
    _pendingEvents = [NSMutableArray new];
    _didApplyInitialProps = NO;

    Class hostClass = NSClassFromString(@"FlyQSpatialHostView");
    UIView *candidate = nil;
    if (hostClass != nil && [hostClass isSubclassOfClass:[UIView class]]) {
      candidate = [[hostClass alloc] initWithFrame:self.bounds];
    }
    if (candidate != nil && [candidate respondsToSelector:@selector(dispatchCommand:argsJson:)] &&
        [candidate respondsToSelector:@selector(setOnEvent:)] &&
        [candidate respondsToSelector:@selector(applyVenueId:)] &&
        [candidate respondsToSelector:@selector(applyDebugEnabled:)]) {
      _hostView = (UIView<FlyQSpatialHostViewAPI> *)candidate;
      __weak FlyQSpatialViewComponentView *weakSelf = self;
      [_hostView setOnEvent:^(NSString *name, NSString *payload) {
        FlyQSpatialViewComponentView *strongSelf = weakSelf;
        if (strongSelf != nil) {
          [strongSelf emitSpatialEvent:name payload:payload];
        }
      }];
      self.contentView = _hostView;
    } else {
      UILabel *label = [UILabel new];
      label.text = @"FlyQSpatial: native view not found.\nRun `pod install` in ios/ and rebuild.";
      label.numberOfLines = 0;
      label.textAlignment = NSTextAlignmentCenter;
      label.textColor = [UIColor whiteColor];
      label.backgroundColor = [UIColor blackColor];
      self.contentView = label;
    }
  }
  return self;
}

- (void)updateProps:(const Props::Shared &)props oldProps:(const Props::Shared &)oldProps
{
  const auto &oldViewProps = *std::static_pointer_cast<const FlyQSpatialViewProps>(_props);
  const auto &newViewProps = *std::static_pointer_cast<const FlyQSpatialViewProps>(props);

  if (_hostView != nil) {
    if (!_didApplyInitialProps || oldViewProps.venueId != newViewProps.venueId) {
      NSString *venueId = [NSString stringWithUTF8String:newViewProps.venueId.c_str()];
      [_hostView applyVenueId:(venueId ?: @"")];
    }
    if (!_didApplyInitialProps || oldViewProps.debugEnabled != newViewProps.debugEnabled) {
      [_hostView applyDebugEnabled:(newViewProps.debugEnabled ? YES : NO)];
    }
    _didApplyInitialProps = YES;
  }

  [super updateProps:props oldProps:oldProps];
}

- (void)updateEventEmitter:(const EventEmitter::Shared &)eventEmitter
{
  [super updateEventEmitter:eventEmitter];
  [self flushPendingEvents];
}

- (void)handleCommand:(const NSString *)commandName args:(const NSArray *)args
{
  RCTFlyQSpatialViewHandleCommand(self, commandName, args);
}

#pragma mark - RCTFlyQSpatialViewViewProtocol

- (void)dispatch:(NSString *)command argsJson:(NSString *)argsJson
{
  if (_hostView == nil) {
    return;
  }
  [_hostView dispatchCommand:(command ?: @"") argsJson:(argsJson ?: @"{}")];
}

#pragma mark - Events

- (void)emitSpatialEvent:(NSString *)name payload:(NSString *)payload
{
  NSString *safeName = name ?: @"";
  NSString *safePayload = payload ?: @"{}";
  if (!_eventEmitter) {
    // Keep the most recent events until React attaches the emitter.
    if (_pendingEvents.count >= 64) {
      [_pendingEvents removeObjectAtIndex:0];
    }
    [_pendingEvents addObject:@[ safeName, safePayload ]];
    return;
  }
  auto emitter = std::static_pointer_cast<const FlyQSpatialViewEventEmitter>(_eventEmitter);
  FlyQSpatialViewEventEmitter::OnSpatialEvent event{};
  const char *nameChars = safeName.UTF8String;
  const char *payloadChars = safePayload.UTF8String;
  event.name = std::string(nameChars != nullptr ? nameChars : "");
  event.payload = std::string(payloadChars != nullptr ? payloadChars : "{}");
  emitter->onSpatialEvent(event);
}

- (void)flushPendingEvents
{
  if (!_eventEmitter || _pendingEvents.count == 0) {
    return;
  }
  NSArray<NSArray<NSString *> *> *pending = [_pendingEvents copy];
  [_pendingEvents removeAllObjects];
  for (NSArray<NSString *> *item in pending) {
    if (item.count == 2) {
      [self emitSpatialEvent:item[0] payload:item[1]];
    }
  }
}

#pragma mark - Teardown

- (void)invalidate
{
  if (_hostView != nil) {
    [_hostView invalidateSpatial];
  }
  [super invalidate];
}

@end
