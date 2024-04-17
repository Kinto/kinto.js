from pyramid.authentication import CallbackAuthenticationPolicy
from pyramid.security import Everyone, Authenticated
import jwt  # PyJWT

class GroupAwareAuthenticationPolicy(CallbackAuthenticationPolicy):
  def __init__(self, secret, *args, **kwargs):
    self.secret = secret
    super().__init__(*args, **kwargs)

  def unauthenticated_userid(self, request):
    """Extract the user ID from the JWT token."""
    token = request.headers.get('Authorization', '').split(None, 1)[-1]
    try: