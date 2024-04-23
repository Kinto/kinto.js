from pyramid.view import view_config
from pyramid.security import remember, forget
from pyramid.httpexceptions import HTTPFound, HTTPUnauthorized

@view_config(route_name='login', request_method='POST')
def login(request):
    username = request.params.get('username')
    password = request.params.get('password')

    if username is None or password is None:
        return HTTPUnauthorized('Username and password are required')

    if check_credentials(username, password):
        headers = remember(request, username)
        return HTTPFound(location="/", headers=headers)

    return HTTPUnauthorized('Invalid username or password')
